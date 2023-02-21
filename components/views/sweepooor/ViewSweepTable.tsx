import React, {useCallback, useMemo, useState} from 'react';
import Link from 'next/link';
import IconRefresh from 'components/icons/IconRefresh';
import {ImageWithFallback} from 'components/ImageWithFallback';
import ListHead from 'components/ListHead';
import {Step, useSweepooor} from 'contexts/useSweepooor';
import {useWallet} from 'contexts/useWallet';
import {useSolverCowswap} from 'hooks/useSolverCowswap';
import handleInputChangeEventValue from 'utils/handleInputChangeEventValue';
import {useDebouncedCallback, useMountEffect, useUpdateEffect} from '@react-hookz/web';
import {Button} from '@yearn-finance/web-lib/components/Button';
import {useWeb3} from '@yearn-finance/web-lib/contexts/useWeb3';
import {hooks} from '@yearn-finance/web-lib/hooks';
import {useChain} from '@yearn-finance/web-lib/hooks/useChain';
import {useChainID} from '@yearn-finance/web-lib/hooks/useChainID';
import IconLinkOut from '@yearn-finance/web-lib/icons/IconLinkOut';
import {toAddress, truncateHex} from '@yearn-finance/web-lib/utils/address';
import {ETH_TOKEN_ADDRESS, WETH_TOKEN_ADDRESS} from '@yearn-finance/web-lib/utils/constants';
import {formatBN, toNormalizedBN, Zero} from '@yearn-finance/web-lib/utils/format.bigNumber';
import {formatAmount} from '@yearn-finance/web-lib/utils/format.number';
import performBatchedUpdates from '@yearn-finance/web-lib/utils/performBatchedUpdates';

import type {BigNumber} from 'ethers';
import type {TMinBalanceData} from 'hooks/useBalances';
import type {TCowAPIResult} from 'hooks/useSolverCowswap';
import type {ChangeEvent, ReactElement} from 'react';
import type {TAddress} from '@yearn-finance/web-lib/utils/address';
import type {TNormalizedBN} from '@yearn-finance/web-lib/utils/format.bigNumber';
import type {TDict} from '@yearn-finance/web-lib/utils/types';

function	TokenRow({address: tokenAddress, balance}: {balance: TMinBalanceData, address: TAddress}): ReactElement {
	const cowswap = useSolverCowswap();
	const {selected, set_selected, amounts, set_amounts, set_quotes, destination} = useSweepooor();
	const {address: fromAddress, chainID, isActive} = useWeb3();
	const {safeChainID} = useChainID();
	const isSelected = useMemo((): boolean => selected.includes(tokenAddress), [selected, tokenAddress]);
	const chain = useChain();
	const [quote, set_quote] = useState(toNormalizedBN(0));
	const [isDisabled, set_isDisabled] = useState(false);
	const [isLoadingQuote, set_isLoadingQuote] = useState(false);
	const [error, set_error] = useState('');

	const	updateOnConextChange = useCallback((): void => {
		performBatchedUpdates((): void => {
			set_quote(toNormalizedBN(0));
			set_isDisabled(false);
			set_error('');
			set_amounts((amounts: TDict<TNormalizedBN>): TDict<TNormalizedBN> => ({
				...amounts,
				[toAddress(tokenAddress)]: toNormalizedBN(balance.raw, balance.decimals)
			}));
		});
	}, [tokenAddress, balance]); // eslint-disable-line react-hooks/exhaustive-deps

	const	estimateQuote = useCallback(async (rawAmount: BigNumber): Promise<void> => {
		if (!isSelected) {
			return;
		}
		performBatchedUpdates((): void => {
			set_error('');
			set_isLoadingQuote(true);
		});
		const [cowswapQuote, order, isSuccess] = await cowswap.init({
			from: toAddress(fromAddress || ''),
			inputToken: {
				value: toAddress(tokenAddress),
				label: balance.symbol,
				symbol: balance.symbol,
				decimals: balance.decimals
			},
			outputToken: {
				value: destination.address,
				label: destination.name,
				symbol: destination.symbol,
				decimals: destination.decimals
			},
			inputAmount: formatBN(rawAmount)
		});
		if (isSuccess) {
			performBatchedUpdates((): void => {
				if (order) {
					set_quotes((quotes: TDict<TCowAPIResult>): TDict<TCowAPIResult> => ({
						...quotes,
						[toAddress(tokenAddress)]: order
					}));
				}
				set_quote(cowswapQuote);
				set_isLoadingQuote(false);
			});
		} else {
			performBatchedUpdates((): void => {
				set_error(`Fee is too high for this amount: ${formatAmount(Number(cowswapQuote.normalized), 4, 4)}`);
				set_selected((s): TAddress[] => s.filter((item: TAddress): boolean => item !== tokenAddress));
				set_isDisabled(cowswapQuote.raw.gte(balance.raw));
				set_isLoadingQuote(false);
			});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [balance, cowswap.init, fromAddress, tokenAddress, isSelected, destination]);

	const	debouncedEstimateQuote = useDebouncedCallback(async (rawAmount: BigNumber): Promise<void> => {
		if (!isSelected) {
			return;
		}
		performBatchedUpdates((): void => {
			set_error('');
			set_isLoadingQuote(true);
		});
		const [cowswapQuote, order, isSuccess] = await cowswap.init({
			from: toAddress(fromAddress || ''),
			inputToken: {
				value: toAddress(tokenAddress),
				label: balance.symbol,
				symbol: balance.symbol,
				decimals: balance.decimals
			},
			outputToken: {
				value: destination.address,
				label: destination.name,
				symbol: destination.symbol,
				decimals: destination.decimals
			},
			inputAmount: formatBN(rawAmount)
		});
		if (isSuccess) {
			performBatchedUpdates((): void => {
				if (order) {
					set_quotes((quotes: TDict<TCowAPIResult>): TDict<TCowAPIResult> => ({
						...quotes,
						[toAddress(tokenAddress)]: order
					}));
				}
				set_quote(cowswapQuote);
				set_isLoadingQuote(false);
			});
		} else {
			performBatchedUpdates((): void => {
				if (cowswapQuote.raw.gt(Zero)) {
					set_error(`Fee is too high for this amount: ${formatAmount(Number(cowswapQuote.normalized), 4, 4)}`);
				}
				set_selected((s): TAddress[] => s.filter((item: TAddress): boolean => item !== tokenAddress));
				set_isDisabled(cowswapQuote.raw.gte(balance.raw));
				set_isLoadingQuote(false);
			});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [balance, cowswap.init, fromAddress, tokenAddress, isSelected, destination], 400);

	useMountEffect((): void => {
		if (amounts[toAddress(tokenAddress)] === undefined) {
			set_amounts((amounts: TDict<TNormalizedBN>): TDict<TNormalizedBN> => ({
				...amounts,
				[toAddress(tokenAddress)]: toNormalizedBN(balance.raw, balance.decimals)
			}));
		}
	});

	useUpdateEffect((): void => {
		updateOnConextChange();
	}, [chainID, updateOnConextChange, fromAddress, destination?.address]);

	useUpdateEffect((): void => {
		estimateQuote(amounts[toAddress(tokenAddress)]?.raw);
	}, [estimateQuote]);

	function onToggle(): void {
		if (isDisabled) {
			return;
		}
		performBatchedUpdates((): void => {
			set_selected(isSelected ? selected.filter((item: TAddress): boolean => item !== tokenAddress) : [...selected, tokenAddress]);
			set_quote(toNormalizedBN(0));
			set_quotes((quotes: TDict<TCowAPIResult>): TDict<TCowAPIResult> => {
				if (isSelected) {
					const newQuotes = {...quotes};
					delete newQuotes[toAddress(tokenAddress)];
					return newQuotes;
				}
				return quotes;
			});
		});
	}

	return (
		<div
			className={`yearn--table-wrapper group relative border-x-2 border-y-0 border-solid pb-2 text-left hover:bg-neutral-100/50 ${isSelected ? 'border-transparent' : 'border-transparent'} ${isDisabled ? 'pointer-events-none opacity-20' : ''}`}>
			<div className={'absolute left-3 top-7 z-10 flex h-full justify-center md:left-6 md:top-0 md:items-center'}>
				<input
					type={'checkbox'}
					checked={isSelected}
					onChange={onToggle}
					className={'checkbox cursor-pointer'} />
			</div>
			<div className={'col-span-3 mb-2 flex h-16 flex-row items-start border-0 border-neutral-200 py-4 pl-8 md:mb-0 md:border-r md:py-0'}>
				<div className={'yearn--table-token-section-item pt-1'}>
					<div className={'yearn--table-token-section-item-image'}>
						<ImageWithFallback
							alt={''}
							width={40}
							height={40}
							quality={90}
							src={`https://raw.githubusercontent.com/yearn/yearn-assets/master/icons/multichain-tokens/${safeChainID}/${toAddress(tokenAddress)}/logo-128.png`}
							loading={'eager'} />
					</div>
					<div>
						<div className={'flex flex-row items-center space-x-2'}>
							<b>{balance.symbol}</b>
						</div>
						<Link
							href={`${chain.getCurrent()?.block_explorer}/address/${tokenAddress}`}
							onClick={(e): void => e.stopPropagation()}
							className={'flex cursor-pointer flex-row items-center space-x-2 text-neutral-500 transition-colors hover:text-neutral-900 hover:underline'}>
							<p className={'font-mono text-xs'}>{truncateHex(tokenAddress, 8)}</p>
							<IconLinkOut className={'h-3 w-3'} />
						</Link>
					</div>
				</div>
			</div>

			<div className={'yearn--table-data-section'}>
				<div className={'yearn--table-data-section-item md:col-span-7 md:px-6'}>
					<label className={'yearn--table-data-section-item-label'}>{'Amount to migrate'}</label>
					<div className={'box-0 flex h-10 w-full items-center p-2'}>
						<div
							className={'flex h-10 w-full flex-row items-center justify-between py-4 px-0'}
							onClick={(e): void => e.stopPropagation()}>
							<input
								className={`scrollbar-none w-full overflow-x-scroll border-none bg-transparent py-4 px-0 text-sm font-bold outline-none ${isActive ? '' : 'cursor-not-allowed'}`}
								type={'number'}
								min={0}
								step={1 / 10 ** (balance.decimals || 18)}
								max={balance.normalized}
								inputMode={'numeric'}
								pattern={'^((?:0|[1-9]+)(?:.(?:d+?[1-9]|[1-9]))?)$'}
								disabled={!isActive}
								value={amounts[toAddress(tokenAddress)]?.normalized ?? '0'}
								onChange={(e: ChangeEvent<HTMLInputElement>): void => {
									let	newAmount = handleInputChangeEventValue(e, balance?.decimals || 18);
									if (newAmount.raw.gt(balance.raw)) {
										newAmount = balance;
									}
									performBatchedUpdates((): void => {
										set_error('');
										set_amounts((amounts): TDict<TNormalizedBN> => ({...amounts, [toAddress(tokenAddress)]: newAmount}));
										set_selected((s): TAddress[] => {
											if (newAmount.raw.gt(0) && !s.includes(tokenAddress)) {
												return [...s, tokenAddress];
											}
											return s.filter((item: TAddress): boolean => item !== tokenAddress);
										});

									});
									debouncedEstimateQuote(newAmount?.raw);
								}} />
							<button
								onClick={(): void => {
									performBatchedUpdates((): void => {
										set_error('');
										set_amounts((amounts): TDict<TNormalizedBN> => ({...amounts, [toAddress(tokenAddress)]: balance}));
										set_selected((s): TAddress[] => {
											if (balance.raw.gt(0) && !s.includes(tokenAddress)) {
												return [...s, tokenAddress];
											}
											return s.filter((item: TAddress): boolean => item !== tokenAddress);
										});
									});
									estimateQuote(balance?.raw);
								}}
								className={'text-xxs hover:text-neutral-0 ml-2 cursor-pointer rounded-sm border border-neutral-900 bg-neutral-100 px-2 py-1 text-neutral-900 transition-colors hover:bg-neutral-900'}>
								{'max'}
							</button>
						</div>
					</div>
					<legend className={'text-xxs pl-1 text-[#e11d48]'}>{error}</legend>
				</div>

				<div className={'yearn--table-data-section-item md:col-span-5 '} datatype={'number'}>
					<label className={'yearn--table-data-section-item-label'}>{'Amount to migrate'}</label>
					<div className={'box-0 relative flex h-10 w-full items-center p-2'}>
						<div
							className={'flex h-10 w-full flex-row items-center justify-between py-4 px-0'}
							onClick={(e): void => e.stopPropagation()}>
							<input
								className={`scrollbar-none w-full overflow-x-scroll border-none bg-transparent py-4 px-0 text-sm font-bold outline-none ${isActive ? '' : 'cursor-not-allowed'}`}
								type={'number'}
								readOnly
								value={quote?.normalized ?? '0'} />
							{isLoadingQuote && (
								<div className={'rounded-default bg-neutral-0 absolute inset-0 flex flex-row items-center pl-6'}>
									<div className={'flex h-10 items-center justify-center text-neutral-900'}>
										<span className={'loader-900'} />
									</div>
								</div>
							)}
							<button
								onClick={(): void => {
									set_error('');
									estimateQuote(amounts[toAddress(tokenAddress)]?.raw);
								}}
								className={'cursor-pointer text-neutral-200 transition-colors hover:text-neutral-900'}>
								<IconRefresh className={'h-3 w-3'} />
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function	ViewSweepTable(): ReactElement {
	const	{isActive, chainID} = useWeb3();
	const	{selected, set_currentStep, quotes, destination} = useSweepooor();
	const	{balances, balancesNonce} = useWallet();
	const	[sortBy, set_sortBy] = useState<string>('apy');
	const	[sortDirection, set_sortDirection] = useState<'asc' | 'desc'>('desc');

	const	hasQuoteForEverySelectedToken = useMemo((): boolean => {
		return (selected.length > 0 && selected.every((tokenAddress: string): boolean => (
			quotes[toAddress(tokenAddress)] !== undefined
		)));
	}, [selected, quotes]);

	const	balancesToDisplay = hooks.useDeepCompareMemo((): ReactElement[] => {
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
				.map(([address, balance]: [string, TMinBalanceData]): ReactElement => {
					return <TokenRow
						key={`${address}-${chainID}-${balance.symbol}`}
						balance={balance}
						address={toAddress(address)} />;
				})
		);
	}, [balances, balancesNonce, sortBy, sortDirection, chainID, destination]);

	return (
		<section className={'pt-10'}>
			<div id={'selector'} className={'box-0 relative grid w-full grid-cols-12 overflow-hidden'}>
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

				<div className={'text-neutral-0 fixed inset-x-0 bottom-0 z-20 col-span-12 flex w-full max-w-4xl flex-row items-center justify-between bg-neutral-900 p-4 md:relative md:px-6 md:py-4'}>
					<div className={'flex flex-col'} />
					<div>
						<Button
							className={'yearn--button !w-fit !px-6 !text-sm'}
							variant={'reverted'}
							isDisabled={!isActive || ((selected.length === 0)) || !hasQuoteForEverySelectedToken}
							onClick={(): void => set_currentStep(Step.APPROVALS)}>
							{'Confirm'}
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
export default ViewSweepTable;
