import React, {useMemo, useState} from 'react';
import TokenRow from 'components/app/sweepooor/TokenRow';
import ListHead from 'components/ListHead';
import {useSweepooor} from 'contexts/useSweepooor';
import {useWallet} from 'contexts/useWallet';
import {Button} from '@yearn-finance/web-lib/components/Button';
import {useWeb3} from '@yearn-finance/web-lib/contexts/useWeb3';
import {useChain} from '@yearn-finance/web-lib/hooks/useChain';
import {toAddress} from '@yearn-finance/web-lib/utils/address';
import {ETH_TOKEN_ADDRESS, WETH_TOKEN_ADDRESS} from '@yearn-finance/web-lib/utils/constants';
import performBatchedUpdates from '@yearn-finance/web-lib/utils/performBatchedUpdates';

import type {TMinBalanceData} from 'hooks/useBalances';
import type {ReactElement} from 'react';

function	ViewSweepTable({onProceed}: {onProceed: VoidFunction}): ReactElement {
	const	{isActive, address, chainID} = useWeb3();
	const	{selected, quotes, destination, amounts} = useSweepooor();
	const	{balances, balancesNonce} = useWallet();
	const	[sortBy, set_sortBy] = useState<string>('apy');
	const	[sortDirection, set_sortDirection] = useState<'asc' | 'desc'>('desc');
	const	currentChain = useChain().getCurrent();

	const	hasQuoteForEverySelectedToken = useMemo((): boolean => {
		return (selected.length > 0 && selected.every((tokenAddress: string): boolean => (
			quotes[toAddress(tokenAddress)] !== undefined
		)));
	}, [selected, quotes]);

	const	balancesToDisplay = useMemo((): ReactElement[] => {
		balancesNonce;
		return (
			Object.entries(balances || [])
				.filter(([, balance]: [string, TMinBalanceData]): boolean => (
					(balance?.raw && !balance.raw.isZero()) || (balance?.force || false)
				))
				.filter(([tokenAddress]: [string, TMinBalanceData]): boolean => (
					toAddress(tokenAddress) !== destination.address && toAddress(tokenAddress) !== ETH_TOKEN_ADDRESS
				))
				.filter(([tokenAddress]: [string, TMinBalanceData]): boolean => (
					destination.address === ETH_TOKEN_ADDRESS ? toAddress(tokenAddress) !== WETH_TOKEN_ADDRESS : true
				))
				.sort((a: [string, TMinBalanceData], b: [string, TMinBalanceData]): number => {
					const	[, aBalance] = a;
					const	[, bBalance] = b;

					if (sortBy === 'name') {
						return sortDirection === 'asc'
							? aBalance.symbol.localeCompare(bBalance.symbol)
							: bBalance.symbol.localeCompare(aBalance.symbol);
					}
					if (sortBy === 'balance') {
						return sortDirection === 'asc'
							? aBalance.raw.gt(bBalance.raw) ? 1 : -1
							: aBalance.raw.gt(bBalance.raw) ? -1 : 1;
					}
					return 0;
				})
				.map(([tokenAddress, balance]: [string, TMinBalanceData]): ReactElement => {
					return <TokenRow
						key={`${tokenAddress}-${chainID}-${balance.symbol}-${address}`}
						amount={amounts[toAddress(tokenAddress)]}
						explorer={currentChain?.block_explorer}
						balance={balance}
						tokenAddress={toAddress(tokenAddress)} />;
				})
		);
	}, [balancesNonce, balances, destination.address, sortBy, sortDirection, chainID, address, amounts, currentChain?.block_explorer]);

	return (
		<section>
			<div className={'box-0 relative grid w-full grid-cols-12 overflow-hidden'}>
				<div className={'col-span-12 flex flex-col p-4 text-neutral-900 md:p-6 md:pb-4'}>
					<div className={'w-full md:w-3/4'}>
						<b>{'Select the tokens to migrate'}</b>
						<p className={'text-sm text-neutral-500'}>
							{'Select the tokens you want to migrate to another wallet. You can migrate all your tokens at once or select individual tokens.'}
						</p>
					</div>
				</div>

				<div className={'col-span-12 border-t border-neutral-200'}>
					<ListHead
						sortBy={sortBy}
						sortDirection={sortDirection}
						onSort={(newSortBy, newSortDirection): void => {
							performBatchedUpdates((): void => {
								set_sortBy(newSortBy);
								set_sortDirection(newSortDirection as 'asc' | 'desc');
							});
						}}
						items={[
							{label: 'Token', value: 'name', sortable: true},
							{label: 'Amount', value: 'balance', sortable: false, className: 'col-span-6 md:pl-5', datatype: 'text'},
							{label: `Output (${destination.symbol})`, value: '', sortable: false, className: 'col-span-6 md:pl-7', datatype: 'text'}
						]} />
					<div>
						{balancesToDisplay}
					</div>
				</div>

				<div className={'fixed inset-x-0 bottom-0 z-20 col-span-12 flex w-full max-w-4xl flex-row items-center justify-between bg-neutral-900 p-4 text-neutral-0 md:relative md:px-6 md:py-4'}>
					<div className={'flex flex-col'} />
					<div>
						<Button
							className={'yearn--button !w-fit !px-6 !text-sm'}
							variant={'reverted'}
							isDisabled={!isActive || ((selected.length === 0)) || !hasQuoteForEverySelectedToken}
							onClick={onProceed}>
							{'Confirm'}
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
export default ViewSweepTable;