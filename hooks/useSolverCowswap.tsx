import {useCallback, useMemo, useRef} from 'react';
import {ethers} from 'ethers';
import axios from 'axios';
import useSWRMutation from 'swr/mutation';
import {domain, OrderKind, SigningScheme, signOrder} from '@gnosis.pm/gp-v2-contracts';
import {yToast} from '@yearn-finance/web-lib/components/yToast';
import {useWeb3} from '@yearn-finance/web-lib/contexts/useWeb3';
import {useLocalStorage} from '@yearn-finance/web-lib/hooks';
import {isZeroAddress, toAddress} from '@yearn-finance/web-lib/utils/address';
import {formatBN, toNormalizedBN, Zero} from '@yearn-finance/web-lib/utils/format.bigNumber';

import type {BigNumber} from 'ethers';
import type {ReactElement} from 'react';
import type {TAddress} from '@yearn-finance/web-lib/utils/address';
import type {TNormalizedBN} from '@yearn-finance/web-lib/utils/format.bigNumber';
import type {Order, QuoteQuery, Timestamp} from '@gnosis.pm/gp-v2-contracts';

type TPossibleStatus = 'pending' | 'expired' | 'fulfilled' | 'cancelled' | 'invalid'
type TToken = {
	label: string;
	symbol: string;
	decimals: number;
	value: string;
	icon?: ReactElement;
}
type TInitSolverArgs = {
	from: TAddress,
	inputToken: TToken
	outputToken: TToken
	inputAmount: BigNumber
}
export type TCowAPIResult = {
	quote: Order;
	request: TInitSolverArgs,
	from: string;
	expiration: string;
	signature: string;
	id: number;
	inputTokenDecimals: number,
	outputTokenDecimals: number,
	orderUID?: string,
	orderStatus?: TPossibleStatus,
}
type TCowResult = {
	result: TCowAPIResult | undefined,
	isLoading: boolean,
	error: Error | undefined
}
type TSolverContext = {
	init: (args: TInitSolverArgs) => Promise<[TNormalizedBN, TCowAPIResult | undefined, boolean]>;
	signCowswapOrder: (quote: Order) => Promise<string>;
	execute: (quoteOrder: TCowAPIResult, onSubmitted: (orderUID: string) => void) => Promise<TPossibleStatus>;
}

function useCowswapQuote(): [
	TCowResult,
	(request: TInitSolverArgs, shouldPreventErrorToast?: boolean) => Promise<[TCowAPIResult | undefined, BigNumber]>] {
	const {toast} = yToast();
	const {data, error, trigger, isMutating} = useSWRMutation(
		'https://api.cow.fi/mainnet/api/v1/quote',
		async (url: string, data: {arg: unknown}): Promise<TCowAPIResult> => {
			const req = await axios.post(url, data.arg);
			return req.data;
		}
	);

	const getQuote = useCallback(async (
		request: TInitSolverArgs,
		shouldPreventErrorToast = false
	): Promise<[TCowAPIResult | undefined, BigNumber]> => {
		const	YEARN_APP_DATA = '0x5d22bf49b708de1d2d9547a6cca9faccbdc2b162012e8573811c07103b163d4b';
		const	quote: QuoteQuery = ({
			from: request.from, // receiver
			sellToken: toAddress(request.inputToken.value), // token to spend
			buyToken: toAddress(request.outputToken.value), // token to receive
			receiver: request.from, // always the same as from
			appData: YEARN_APP_DATA, // Always this
			kind: OrderKind.SELL, // always sell
			partiallyFillable: false, // always false
			validTo: 0,
			sellAmountBeforeFee: formatBN(request?.inputAmount || 0).toString() // amount to sell, in wei
		});

		const canExecuteFetch = (
			!(isZeroAddress(quote.from) || isZeroAddress(quote.sellToken) || isZeroAddress(quote.buyToken))
			&& !formatBN(request?.inputAmount || 0).isZero()
		);
		if (canExecuteFetch) {
			quote.validTo = Math.round((new Date().setMinutes(new Date().getMinutes() + 5) / 1000));
			try {
				const result = await trigger(quote, {revalidate: false});
				if (result) {
					result.inputTokenDecimals = request.inputToken.decimals;
					result.outputTokenDecimals = request.outputToken.decimals;
				}
				return ([result, Zero]);
			} catch (error) {
				const	_error = error as any;
				console.error(error);
				if (shouldPreventErrorToast) {
					return [undefined, formatBN(_error?.response?.data?.data?.fee_amount || 0)];
				}
				const	message = `Zap not possible. Try again later or pick another token. ${_error?.response?.data?.description ? `(Reason: [${_error?.response?.data?.description}])` : ''}`;
				toast({type: 'error', content: message});
				// _error?.response?.data?.data?.fee_amount
				return [undefined, formatBN(_error?.response?.data?.data?.fee_amount || 0)];
			}
		}
		return [undefined, formatBN(0)];
	}, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

	return [
		useMemo((): TCowResult => ({
			result: data,
			isLoading: isMutating,
			error
		}), [data, error, isMutating]),
		getQuote
	];
}

export function useSolverCowswap(): TSolverContext {
	const {address, provider} = useWeb3();
	const maxIterations = 1000; // 1000 * up to 3 seconds = 3000 seconds = 50 minutes
	const shouldUsePresign = true; //Debug only
	const [zapSlippage] = useLocalStorage<number>('migratooor/zap-slippage', 0.1);
	const [, getQuote] = useCowswapQuote();
	const request = useRef<TInitSolverArgs>();

	/* 🔵 - Yearn Finance **************************************************************************
	** A slippage of 1% per default is set to avoid the transaction to fail due to price
	** fluctuations. The buyAmountWithSlippage is used to request this amount instead of the
	** original buyAmount.
	**********************************************************************************************/
	const getBuyAmountWithSlippage = useCallback((quote: Order, decimals: number): string => {
		const buyAmount = Number(ethers.utils.formatUnits(quote.buyAmount, decimals));
		const withSlippage = ethers.utils.parseUnits((buyAmount * (1 - Number(zapSlippage / 100))).toFixed(decimals), decimals);
		return withSlippage.toString();
	}, [zapSlippage]);

	/* 🔵 - Yearn Finance **************************************************************************
	** init will be called when the cowswap solver should be used to perform the desired swap.
	** It will set the request to the provided value, as it's required to get the quote, and will
	** call getQuote to get the current quote for the provided request.current.
	**********************************************************************************************/
	const init = useCallback(async (_request: TInitSolverArgs): Promise<[
		TNormalizedBN,
		TCowAPIResult | undefined,
		boolean
	]> => {
		const [quote, minFeeAmount] = await getQuote(_request);
		if (quote) {
			const buyAmountWithSlippage = getBuyAmountWithSlippage(quote.quote, request?.current?.outputToken?.decimals || 18);
			quote.request = _request;
			return [
				toNormalizedBN(buyAmountWithSlippage || 0, request?.current?.outputToken?.decimals || 18), quote,
				true
			];
		}
		return [
			toNormalizedBN(minFeeAmount || 0, request?.current?.outputToken?.decimals || 18),
			undefined,
			false
		];
	}, [getBuyAmountWithSlippage, getQuote]);

	/* 🔵 - Yearn Finance **************************************************************************
	** signCowswapOrder is used to sign the order with the user's wallet. The signature is used
	** to execute the order.
	** If shouldUsePresign is set to true, the signature is not required and the approval is
	** skipped. This should only be used for debugging purposes.
	**********************************************************************************************/
	const	signCowswapOrder = useCallback(async (quote: Order): Promise<string> => {
		if (shouldUsePresign) {
			//sleep 1 second to simulate the signing process
			await new Promise(async (resolve): Promise<NodeJS.Timeout> => setTimeout(resolve, 1000));
			return toAddress(address || '');
		}

		const	signer = (provider as ethers.providers.Web3Provider).getSigner();
		const	rawSignature = await signOrder(
			domain(1, '0x9008D19f58AAbD9eD0D60971565AA8510560ab41'),
			quote,
			signer,
			SigningScheme.EIP712
		);
		return ethers.utils.joinSignature(rawSignature.data);
	}, [provider, shouldUsePresign, address]);

	/* 🔵 - Yearn Finance **************************************************************************
	** Cowswap orders have a validity period and the return value on submit is not the execution
	** status of the order. This method is used to check the status of the order and returns a
	** boolean value indicating whether the order was successful or not.
	** It will timeout once the order is no longer valid or after 50 minutes (max should be 30mn)
	**********************************************************************************************/
	async function checkOrderStatus(orderUID: string, validTo: Timestamp): Promise<{status: TPossibleStatus, isSuccessful: boolean, error?: Error}> {
		for (let i = 0; i < maxIterations; i++) {
			const {data: order} = await axios.get(`https://api.cow.fi/mainnet/api/v1/orders/${orderUID}`);
			if (order?.status === 'fulfilled') {
				return ({status: order?.status, isSuccessful: true});
			}
			if (order?.status === 'cancelled' || order?.status === 'expired') {
				return ({status: order?.status, isSuccessful: false, error: new Error('TX fail because the order was not fulfilled')});
			}
			if (validTo < (new Date().valueOf() / 1000)) {
				return ({status: 'expired', isSuccessful: false, error: new Error('TX fail because the order expired')});
			}
			// Sleep for 3 seconds before checking the status again
			await new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, 3000));
		}
		return ({status: 'expired', isSuccessful: false, error: new Error('TX fail because the order expired')});
	}

	/* 🔵 - Yearn Finance **************************************************************************
	** execute will send the post request to execute the order and wait for it to be executed, no
	** matter the result. It returns a boolean value indicating whether the order was successful or
	** not.
	**********************************************************************************************/
	const execute = useCallback(async (
		quoteOrder: TCowAPIResult,
		onSubmitted: (orderUID: string) => void
	): Promise<TPossibleStatus> => {
		if (!quoteOrder) {
			return 'invalid';
		}
		const	{quote} = quoteOrder;
		try {
			const	buyAmountWithSlippage = getBuyAmountWithSlippage(quote, quoteOrder.outputTokenDecimals);
			const	{data: orderUID} = await axios.post('https://api.cow.fi/mainnet/api/v1/orders', {
				...quote,
				buyAmount: buyAmountWithSlippage,
				from: quoteOrder.from,
				quoteId: quoteOrder.id,
				signature: quoteOrder.signature,
				signingScheme: shouldUsePresign ? 'presign' : 'eip712'
			});
			if (orderUID) {
				onSubmitted?.(orderUID);
				const {status, error} = await checkOrderStatus(orderUID, quote.validTo);
				console.error(error);
				return status;
			}
		} catch (_error) {
			console.error(_error);
			return 'invalid';
		}
		return 'invalid';
	}, [getBuyAmountWithSlippage, shouldUsePresign]);

	return useMemo((): TSolverContext => ({
		init,
		signCowswapOrder,
		execute
	}), [init, signCowswapOrder, execute]);
}
