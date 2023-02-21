import React, {useCallback, useEffect, useMemo, useState} from 'react';
import IconCheck from 'components/icons/IconCheck';
import IconChevronBoth from 'components/icons/IconChevronBoth';
import IconCircleCross from 'components/icons/IconCircleCross';
import IconSpinner from 'components/icons/IconSpinner';
import IconWarning from 'components/icons/IconWarning';
import {useSweepooor} from 'contexts/useSweepooor';
import {useWallet} from 'contexts/useWallet';
import {useSolverCowswap} from 'hooks/useSolverCowswap';
import {approveERC20, isApprovedERC20} from 'utils/actions/approveERC20';
import {useAsync, useIntervalEffect, useUpdateEffect} from '@react-hookz/web';
import {Button} from '@yearn-finance/web-lib/components/Button';
import {useWeb3} from '@yearn-finance/web-lib/contexts/useWeb3';
import {toAddress} from '@yearn-finance/web-lib/utils/address';
import {SOLVER_COW_VAULT_RELAYER_ADDRESS} from '@yearn-finance/web-lib/utils/constants';
import {toNormalizedBN} from '@yearn-finance/web-lib/utils/format.bigNumber';
import {formatAmount} from '@yearn-finance/web-lib/utils/format.number';
import {formatDate, formatDuration} from '@yearn-finance/web-lib/utils/format.time';
import performBatchedUpdates from '@yearn-finance/web-lib/utils/performBatchedUpdates';
import {defaultTxStatus, Transaction} from '@yearn-finance/web-lib/utils/web3/transaction';

import type {ethers} from 'ethers';
import type {TCowAPIResult} from 'hooks/useSolverCowswap';
import type {ReactElement} from 'react';
import type {TAddress} from '@yearn-finance/web-lib/utils/address';
import type {TDict} from '@yearn-finance/web-lib/utils/types';

type TViewApprovalWizardItem = {
	token: TAddress,
	index: number,
	hasSignature: boolean,
	currentWizardApprovalStep: number,
	currentWizardSignStep: number,
}
function	ViewApprovalWizardItem({
	token,
	index,
	hasSignature,
	currentWizardApprovalStep,
	currentWizardSignStep
}: TViewApprovalWizardItem): ReactElement {
	const	{provider} = useWeb3();
	const	{amounts, quotes, set_quotes, destination} = useSweepooor();
	const	{balances} = useWallet();
	const	cowswap = useSolverCowswap();
	const	[isQuoteExpired, set_isQuoteExpired] = useState<boolean>((Number(quotes[toAddress(token)]?.quote?.validTo || 0) * 1000) < new Date().valueOf());
	const	[expireIn, set_expireIn] = useState((Number(quotes[toAddress(token)]?.quote?.validTo || 0) * 1000) - new Date().valueOf());
	const	[step, set_step] = useState<'Approve' | 'Sign' | 'Execute'>('Approve');
	const	[isRefreshingQuote, set_isRefreshingQuote] = useState(false);
	const	hasQuote = Boolean(quotes[toAddress(token)]);
	const	currentQuote = quotes[toAddress(token)];

	const	[{result: hasAllowance}, triggerAllowanceCheck] = useAsync(async (): Promise<boolean> => {
		return await isApprovedERC20(
			provider as ethers.providers.Web3Provider,
			toAddress(token), //from
			toAddress(SOLVER_COW_VAULT_RELAYER_ADDRESS), //migrator
			amounts[toAddress(token)]?.raw
		);
	}, false);

	useEffect((): void => {
		triggerAllowanceCheck.execute();
	}, [triggerAllowanceCheck, token, currentWizardApprovalStep]);

	useIntervalEffect((): void => {
		const	now = new Date().valueOf();
		const	expiration = Number(currentQuote?.quote?.validTo || 0) * 1000;
		set_expireIn(expiration - now);
		set_isQuoteExpired((Number(currentQuote?.quote?.validTo || 0) * 1000) < new Date().valueOf());
	}, !hasQuote || isQuoteExpired ? undefined : 1000);

	useUpdateEffect((): void => {
		set_isQuoteExpired((Number(currentQuote?.quote?.validTo || 0) * 1000) < new Date().valueOf());
	}, [hasQuote]);

	useUpdateEffect((): void => {
		if (hasAllowance && isQuoteExpired) {
			set_step('Sign');
		} else if (hasAllowance && step === 'Approve') {
			set_step('Sign');
		}
	}, [hasAllowance, isQuoteExpired, step]);

	const	estimateQuote = useCallback(async (): Promise<void> => {
		set_isRefreshingQuote(true);
		const [, order] = await cowswap.init({
			from: toAddress(currentQuote?.from),
			inputToken: currentQuote?.request?.inputToken,
			outputToken: currentQuote?.request?.outputToken,
			inputAmount: currentQuote?.request?.inputAmount
		});
		performBatchedUpdates((): void => {
			if (order) {
				console.log(order);
				set_quotes((quotes: TDict<TCowAPIResult>): TDict<TCowAPIResult> => ({...quotes, [toAddress(token)]: order}));
				set_expireIn((Number(order.quote?.validTo || 0) * 1000) - new Date().valueOf());
				set_isQuoteExpired(false);
			}
			set_isRefreshingQuote(false);
		});
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cowswap.init, currentQuote?.from, currentQuote?.request?.inputAmount, currentQuote?.request?.inputToken, currentQuote?.request?.outputToken, set_quotes, token]);

	function	renderApprovalIndication(): ReactElement {
		if (hasAllowance) {
			return (<IconCheck className={'h-4 w-4 text-[#16a34a]'} />);
		}
		if (currentWizardApprovalStep === -1) {
			return (<div className={'h-4 w-4 rounded-full bg-neutral-300'} />);
		}
		if (currentWizardApprovalStep <= index) {
			return <IconSpinner />;
		}
		return (<IconCircleCross className={'h-4 w-4 text-[#e11d48]'} />);
	}

	function	renderSignatureIndication(): ReactElement {
		if (step !== 'Sign' || currentWizardSignStep === -1) {
			return (<div className={'h-4 w-4 rounded-full bg-neutral-300'} />);
		}
		if (isQuoteExpired) {
			return (<IconWarning className={'h-4 w-4 text-[#f97316]'} />);
		}
		if (hasSignature) {
			return (<IconCheck className={'h-4 w-4 text-[#16a34a]'} />);
		}
		if (currentWizardSignStep <= index) {
			return <IconSpinner />;
		}
		return (<IconCircleCross className={'h-4 w-4 text-[#e11d48]'} />);
	}

	function	renderExecuteIndication(): ReactElement {
		if (!currentQuote?.orderStatus) {
			return (<div className={'h-4 w-4 rounded-full bg-neutral-300'} />);
		}
		if (currentQuote.orderStatus === 'fulfilled') {
			return (<IconCheck className={'h-4 w-4 text-[#16a34a]'} />);
		}
		if (currentQuote.orderStatus === 'pending') {
			return <IconSpinner />;
		}
		return (<IconCircleCross className={'h-4 w-4 text-[#e11d48]'} />);
	}

	return (
		<details key={index} className={'detailsSweep rounded-default box-0 group mb-2 flex w-full flex-col justify-center transition-colors hover:bg-neutral-100'}>
			<summary className={'flex flex-col items-start py-2'}>
				<div className={'flex w-full flex-row items-center justify-between'}>
					<div className={'text-left text-sm'}>
						{'Swapping '}
						<span className={'font-number font-bold'}>
							{formatAmount(Number(amounts[toAddress(token)]?.normalized || 0), 6, 6)}
						</span>
						{` ${balances?.[toAddress(token)]?.symbol || 'Tokens'} for at least `}
						<span className={'font-number font-bold'}>
							{formatAmount(Number(toNormalizedBN(currentQuote?.quote?.buyAmount || '').normalized), 6, 6)}
						</span>
						{` ${destination.symbol}`}
					</div>
					<div className={'flex flex-row items-center space-x-2'}>
						{expireIn < 0 && isRefreshingQuote ? (
							<button onClick={estimateQuote}>
								<small className={'text-xs tabular-nums text-neutral-500'}>
									{'Updating quote...'}
								</small>
							</button>
						) : expireIn < 0 ? (
							<button onClick={estimateQuote}>
								<small className={'text-xs tabular-nums text-[#f97316]'}>
									{'Quote expired. Click to update'}
								</small>
							</button>
						) : (
							<button disabled>
								<small className={'text-xs tabular-nums text-neutral-500'}>
									{expireIn < 0 ? 'Expired' : `Expires in ${Math.floor(expireIn / 1000) < 60 ? `${Math.floor(expireIn / 1000)}s` : formatDuration(expireIn)}`}
								</small>
							</button>
						)}
						<IconChevronBoth className={'h-4 w-4 text-neutral-500 transition-colors group-hover:text-neutral-900'} />
					</div>
				</div>
				<div className={'flex flex-row items-center space-x-4 pt-2'}>
					<div className={'flex flex-row items-center justify-center space-x-2'}>
						{renderApprovalIndication()}
						<small>{'Approved'}</small>
					</div>
					<div className={'text-neutral-600'} style={{paddingBottom: 1}}>&rarr;</div>
					<div className={'flex flex-row items-center space-x-2'}>
						{renderSignatureIndication()}
						<small>{'Signed'}</small>
					</div>
					<div className={'text-neutral-600'} style={{paddingBottom: 1}}>&rarr;</div>
					<div className={'flex flex-row items-center space-x-2'}>
						{renderExecuteIndication()}
						<small>
							{'Executed '}
							{currentQuote?.orderUID ? (
								<a
									href={`https://explorer.cow.fi/orders/${currentQuote?.orderUID}`}
									target={'_blank'}
									className={'text-neutral-500 hover:underline'}
									rel={'noreferrer'}>
									{'(see order)'}
								</a>
							) : null}
						</small>

					</div>
				</div>
				{/* <div className={'flex flex-row items-center space-x-4 py-2'}>
					{renderApprovalIndication()}
					{renderSignatureIndication()}
					{renderTextIndication()}
				</div> */}
			</summary>
			<div className={'font-number space-y-2 border-t-0 p-4 text-sm'}>
				<span className={'flex flex-row justify-between'}>
					<b>{'Kind'}</b>
					<p className={'font-number'}>{currentQuote?.quote?.kind || ''}</p>
				</span>
				<span className={'flex flex-row justify-between'}>
					<b>{'Receiver'}</b>
					<p className={'font-number'}>{toAddress(currentQuote?.quote?.receiver || '')}</p>
				</span>

				<span className={'flex flex-row justify-between'}>
					<b>{'BuyAmount'}</b>
					<p className={'font-number'}>
						{`${toNormalizedBN(
							currentQuote?.quote?.buyAmount || '',
							currentQuote?.inputTokenDecimals || 18
						).normalized} (${currentQuote?.quote?.buyAmount || ''})`}
					</p>
				</span>
				<span className={'flex flex-row justify-between'}>
					<b>{'BuyToken'}</b>
					<p className={'font-number'}>
						{`${'ETH'} (${toAddress(currentQuote?.quote?.buyToken || '')})`}
					</p>
				</span>
				<span className={'flex flex-row justify-between'}>
					<b>{'SellAmount'}</b>
					<p className={'font-number'}>
						{`${toNormalizedBN(
							currentQuote?.quote?.sellAmount || '',
							currentQuote?.outputTokenDecimals || 18
						).normalized} (${currentQuote?.quote?.sellAmount || ''})`}
					</p>
				</span>
				<span className={'flex flex-row justify-between'}>
					<b>{'FeeAmount'}</b>
					<p className={'font-number'}>
						{`${toNormalizedBN(
							currentQuote?.quote?.feeAmount || '',
							currentQuote?.outputTokenDecimals || 18
						).normalized} (${currentQuote?.quote?.feeAmount || ''})`}
					</p>
				</span>
				<span className={'flex flex-row justify-between'}>
					<b>{'SellToken'}</b>
					<p className={'font-number'}>
						{`${balances?.[toAddress(token)]?.symbol || ''} (${toAddress(currentQuote?.quote?.sellToken || '')})`}
					</p>
				</span>
				<span className={'flex flex-row justify-between'}>
					<b>{'ValidTo'}</b>
					<p className={'font-number'}>
						{formatDate(Number(currentQuote?.quote?.validTo || 0) * 1000)}
						{isQuoteExpired ? (
							<span className={'font-number pl-2 text-[#f97316]'}>
								{'Expired'}
							</span>
						) : null}
					</p>
				</span>

			</div>
		</details>
	);
}

function	ViewApprovalWizard(): ReactElement {
	const	{provider} = useWeb3();
	const	cowswap = useSolverCowswap();
	const	{selected, amounts, quotes, set_quotes} = useSweepooor();
	const	[currentWizardApprovalStep, set_currentWizardApprovalStep] = useState(-1);
	const	[currentWizardSignStep, set_currentWizardSignStep] = useState(-1);
	const	[approveStatus, set_approveStatus] = useState<TDict<boolean>>({});
	const	[isApproving, set_isApproving] = useState(false);
	const	[isSigning, set_isSigning] = useState(false);
	const	[hasSentOrder, set_hasSentOrder] = useState(false);

	const	[, set_txStatus] = useState(defaultTxStatus);

	async function	onCheckAllowance(): Promise<void> {
		const	allSelected = [...selected];
		for (const token of allSelected) {
			try {
				const	isApproved = await isApprovedERC20(
					provider as ethers.providers.Web3Provider,
					toAddress(token), //from
					toAddress(SOLVER_COW_VAULT_RELAYER_ADDRESS), //migrator
					amounts[toAddress(token)]?.raw
				);
				if (isApproved) {
					set_approveStatus((prev): TDict<boolean> => ({...prev, [toAddress(token)]: true}));
				}
			} catch (error) {
				console.error(error);
			}
		}
	}
	useUpdateEffect((): void => {
		onCheckAllowance();
	}, [selected, amounts]);

	const	onApproveERC20 = useCallback(async (): Promise<void> => {
		const	allSelected = [...selected];

		for (const token of allSelected) {
			try {
				const	isApproved = await isApprovedERC20(
					provider as ethers.providers.Web3Provider,
					toAddress(token), //from
					toAddress(SOLVER_COW_VAULT_RELAYER_ADDRESS), //migrator
					amounts[toAddress(token)]?.raw
				);
				if (!isApproved) {
					await new Transaction(provider, approveERC20, set_txStatus).populate(
						toAddress(token),
						toAddress(SOLVER_COW_VAULT_RELAYER_ADDRESS),
						amounts[toAddress(token)]?.raw
					).onSuccess(async (): Promise<void> => {
						set_approveStatus((prev): TDict<boolean> => ({...prev, [toAddress(token)]: true}));
					}).perform();
				} else {
					set_approveStatus((prev): TDict<boolean> => ({...prev, [toAddress(token)]: true}));
				}
				if (token === allSelected[allSelected.length - 1]) {
					set_isApproving(false);
				}
				set_currentWizardApprovalStep((currentStep: number): number => currentStep + 1);
			} catch (error) {
				console.error(error);
			}
		}
	}, [amounts, provider, selected]);

	const	onSignQuote = useCallback(async (): Promise<void> => {
		const	allSelected = [...selected];
		for (const token of allSelected) {
			try {
				if ((quotes?.[toAddress(token)]?.signature || '') !== '') {
					set_currentWizardSignStep((currentStep: number): number => currentStep + 1);
					if (token === allSelected[allSelected.length - 1]) {
						set_isSigning(false);
					}
					continue;
				}
				const quoteOrder = quotes[toAddress(token)];
				const signature = await cowswap.signCowswapOrder(quoteOrder.quote);
				performBatchedUpdates((): void => {
					set_currentWizardSignStep((currentStep: number): number => currentStep + 1);
					set_quotes((prev): TDict<TCowAPIResult> => ({...prev, [toAddress(token)]: {...quoteOrder, signature}}));
				});
			} catch (error) {
				set_currentWizardSignStep((currentStep: number): number => currentStep + 1);
			}
			if (token === allSelected[allSelected.length - 1]) {
				set_isSigning(false);
			}
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [quotes, selected]);

	const	onSendOrders = useCallback(async (): Promise<void> => {
		const	allSelected = [...selected];
		for (const token of allSelected) {
			try {
				const	_currentQuote = quotes[toAddress(token)];
				if (_currentQuote.orderUID && _currentQuote.orderStatus === 'pending') {
					continue; //skip already sent
				}
				if (_currentQuote.orderUID && _currentQuote.orderStatus === 'fulfilled') {
					continue; //skip done
				}

				//Not signed, force resign
				if ((_currentQuote?.signature || '') === '') {
					const quoteOrder = quotes[toAddress(token)];
					const signature = await cowswap.signCowswapOrder(quoteOrder.quote);
					set_quotes((prev): TDict<TCowAPIResult> => ({...prev, [toAddress(token)]: {...quoteOrder, signature}}));
					_currentQuote.signature = signature;
				}

				cowswap.execute(
					_currentQuote,
					(orderUID): void => {
						set_quotes((prev): TDict<TCowAPIResult> => ({...prev, [toAddress(token)]: {..._currentQuote, orderUID, orderStatus: 'pending'}}));
					})
					.then((status): void => {
						set_quotes((prev): TDict<TCowAPIResult> => ({...prev, [toAddress(token)]: {..._currentQuote, orderStatus: status}}));
					});

			} catch (error) {
				set_quotes((prev): TDict<TCowAPIResult> => ({...prev, [toAddress(token)]: {...quotes[toAddress(token)], orderStatus: 'invalid'}}));
			}
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [quotes, selected]);

	const	shouldAllBeApproved = useMemo((): boolean => selected.length > 0 && Object.values(approveStatus).length === selected.length && Object.values(approveStatus).every((status): boolean => status), [approveStatus, selected]);
	const	shouldAllBeSigned = useMemo((): boolean => selected.length > 0 && Object.values(quotes).length === selected.length && Object.values(quotes).every((quote): boolean => (quote?.signature || '') !== ''), [quotes, selected]);


	useUpdateEffect((): void => {
		if (hasSentOrder || isSigning) {
			return;
		}
		if (shouldAllBeApproved && shouldAllBeSigned) {
			set_hasSentOrder(true);
			onSendOrders();
		}
	}, [hasSentOrder, shouldAllBeApproved, shouldAllBeSigned, isSigning]);

	return (
		<section className={'pt-10'}>
			<div id={'approvals'} className={'box-0 relative flex w-full flex-col items-center justify-center overflow-hidden p-4 md:p-6'}>
				<div className={'mb-6 w-full'}>
					<b>{'Approvals'}</b>
					<p className={'text-sm text-neutral-500'}>
						{'This is a two step process. You first need to approve the tokens you want to sweep, then we will ask you to sign a message to send your order to the CowSwap solver.'}
					</p>
				</div>

				{selected.map((token, index): JSX.Element => {
					return (
						<ViewApprovalWizardItem
							key={index}
							token={token}
							index={index}
							hasSignature={(quotes?.[toAddress(token)]?.signature || '') !== ''}
							currentWizardApprovalStep={currentWizardApprovalStep}
							currentWizardSignStep={currentWizardSignStep}/>
					);
				})}
				<div className={'flex w-full flex-row items-center justify-between pt-4 md:relative'}>
					<div className={'flex flex-col'} />
					<div className={'flex flex-row items-center space-x-4'}>
						<Button
							className={'yearn--button !w-fit !px-6 !text-sm'}
							isBusy={isApproving}
							isDisabled={(selected.length === 0) || shouldAllBeApproved}
							onClick={(): void => {
								performBatchedUpdates((): void => {
									set_isApproving(true);
									set_currentWizardApprovalStep(0);
								});
								onApproveERC20();
							}}>
							{'Approve'}
						</Button>
						<Button
							className={'yearn--button !w-fit !px-6 !text-sm'}
							isBusy={isSigning}
							isDisabled={(selected.length === 0) || !shouldAllBeApproved || shouldAllBeSigned}
							onClick={(): void => {
								if (Object.values(approveStatus).every((status): boolean => status)) {
									set_isSigning(true);
									performBatchedUpdates((): void => {
										set_hasSentOrder(false);
										set_currentWizardSignStep(0);
									});
									onSignQuote();
								}
							}}>
							{'Sign'}
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
export default ViewApprovalWizard;
