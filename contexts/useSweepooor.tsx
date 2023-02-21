import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {useMountEffect, useUpdateEffect} from '@react-hookz/web';
import {useWeb3} from '@yearn-finance/web-lib/contexts/useWeb3';
import {ETH_TOKEN_ADDRESS} from '@yearn-finance/web-lib/utils/constants';
import performBatchedUpdates from '@yearn-finance/web-lib/utils/performBatchedUpdates';

import type {TCowAPIResult} from 'hooks/useSolverCowswap';
import type {Dispatch, SetStateAction} from 'react';
import type {TAddress} from '@yearn-finance/web-lib/utils/address';
import type {TNormalizedBN} from '@yearn-finance/web-lib/utils/format.bigNumber';
import type {TDict} from '@yearn-finance/web-lib/utils/types';
import type {TTokenInfo} from './useTokenList';

export enum	Step {
	WALLET = 'wallet',
	DESTINATION = 'destination',
	SELECTOR = 'selector',
	APPROVALS = 'approval',
	SIGN = 'sign',
	CONFIRMATION = 'confirmation'
}

export type TSelected = {
	selected: TAddress[],
	amounts: TDict<TNormalizedBN>,
	quotes: TDict<TCowAPIResult>,
	destination: TTokenInfo,
	currentStep: Step,
	set_selected: Dispatch<SetStateAction<TAddress[]>>,
	set_amounts: Dispatch<SetStateAction<TDict<TNormalizedBN>>>,
	set_quotes: Dispatch<SetStateAction<TDict<TCowAPIResult>>>,
	set_currentStep: Dispatch<SetStateAction<Step>>,
	set_destination: Dispatch<SetStateAction<TTokenInfo>>
}

const	defaultProps: TSelected = {
	selected: [],
	amounts: {},
	quotes: {},
	destination: {
		chainId: 0,
		address: ETH_TOKEN_ADDRESS,
		name: 'Ether',
		symbol: 'ETH',
		decimals: 18,
		logoURI: `https://raw.githubusercontent.com/yearn/yearn-assets/master/icons/multichain-tokens/1/${ETH_TOKEN_ADDRESS}/logo-128.png`
	},
	currentStep: Step.WALLET,
	set_selected: (): void => undefined,
	set_amounts: (): void => undefined,
	set_quotes: (): void => undefined,
	set_currentStep: (): void => undefined,
	set_destination: (): void => undefined
};

const	SweepooorContext = createContext<TSelected>(defaultProps);
export const SweepooorContextApp = ({children}: {children: React.ReactElement}): React.ReactElement => {
	const	{address, isActive, walletType} = useWeb3();
	const	[selected, set_selected] = useState<TAddress[]>(defaultProps.selected);
	const	[destination, set_destination] = useState<TTokenInfo>(defaultProps.destination);
	const	[quotes, set_quotes] = useState<TDict<TCowAPIResult>>(defaultProps.quotes);
	const	[amounts, set_amounts] = useState<TDict<TNormalizedBN>>(defaultProps.amounts);
	const	[currentStep, set_currentStep] = useState<Step>(Step.WALLET);

	useEffect((): void => {
		if (!isActive) {
			performBatchedUpdates((): void => {
				set_selected([]);
				set_amounts({});
			});
		}
	}, [isActive]);

	useUpdateEffect((): void => {
		if (isActive && address) {
			set_currentStep(Step.DESTINATION);
		} else if (!isActive || !address) {
			set_currentStep(Step.WALLET);
		}
	}, [address, isActive]);

	useMountEffect((): void => {
		setTimeout((): void => {
			const	isEmbedWallet = ['EMBED_LEDGER', 'EMBED_GNOSIS_SAFE'].includes(walletType);

			if (currentStep === Step.WALLET && !isEmbedWallet) {
				document?.getElementById('wallet')?.scrollIntoView({behavior: 'smooth', block: 'start'});
			} else if (currentStep === Step.DESTINATION || isEmbedWallet) {
				document?.getElementById('destinationToken')?.scrollIntoView({behavior: 'smooth', block: 'start'});
			} else if (currentStep === Step.SELECTOR) {
				document?.getElementById('selector')?.scrollIntoView({behavior: 'smooth', block: 'start'});
			} else if (currentStep === Step.APPROVALS) {
				document?.getElementById('approvals')?.scrollIntoView({behavior: 'smooth', block: 'start'});
			}
		}, 0);
	});

	useUpdateEffect((): void => {
		setTimeout((): void => {
			let currentStepContainer;
			const isEmbedWallet = ['EMBED_LEDGER', 'EMBED_GNOSIS_SAFE'].includes(walletType);
			const scalooor = document?.getElementById('scalooor');
			const headerHeight = 96;

			if (currentStep === Step.WALLET && !isEmbedWallet) {
				currentStepContainer = document?.getElementById('wallet');
			} else if (currentStep === Step.DESTINATION || isEmbedWallet) {
				currentStepContainer = document?.getElementById('destinationToken');
			} else if (currentStep === Step.SELECTOR) {
				currentStepContainer = document?.getElementById('selector');
			} else if (currentStep === Step.APPROVALS) {
				currentStepContainer = document?.getElementById('approvals');
			}
			const	currentElementHeight = currentStepContainer?.offsetHeight;
			if (scalooor?.style) {
				scalooor.style.height = `calc(100vh - ${currentElementHeight}px - ${headerHeight}px + 16px)`;
			}
			currentStepContainer?.scrollIntoView({behavior: 'smooth', block: 'start'});
		}, 100);
	}, [currentStep]);

	const	contextValue = useMemo((): TSelected => ({
		selected,
		set_selected,
		amounts,
		set_amounts,
		quotes,
		set_quotes,
		currentStep,
		set_currentStep,
		destination,
		set_destination
	}), [selected, amounts, quotes, currentStep, destination]);

	return (
		<SweepooorContext.Provider value={contextValue}>
			<div id={'SweepTable'} className={'mx-auto w-full overflow-hidden'}>
				{children}
				<div id={'scalooor'} />
			</div>
		</SweepooorContext.Provider>
	);
};

export const useSweepooor = (): TSelected => useContext(SweepooorContext);
