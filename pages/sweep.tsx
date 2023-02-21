import React from 'react';
import ViewApprovalWizard from 'components/views/sweepooor/ViewApprovalWizard';
import ViewDestination from 'components/views/sweepooor/ViewDestination';
import ViewSweepTable from 'components/views/sweepooor/ViewSweepTable';
import ViewWallet from 'components/views/ViewWallet';
import {Step, SweepooorContextApp, useSweepooor} from 'contexts/useSweepooor';
import thumbnailVariants from 'utils/animations';
import {motion} from 'framer-motion';

import type {ReactElement} from 'react';

function	Home(): ReactElement {
	const	{currentStep, set_currentStep} = useSweepooor();

	return (
		<div className={'mx-auto grid w-full max-w-4xl'}>
			<ViewWallet
				onSelect={(): void => {
					set_currentStep(Step.SELECTOR);
					document?.getElementById('selector')?.scrollIntoView({behavior: 'smooth', block: 'center'});
				}} />

			<motion.div
				initial={'initial'}
				animate={[Step.SELECTOR, Step.APPROVALS, Step.DESTINATION].includes(currentStep) ? 'enter' : 'initial'}
				variants={thumbnailVariants}>
				<ViewDestination />
			</motion.div>

			<motion.div
				initial={'initial'}
				animate={[Step.SELECTOR, Step.APPROVALS].includes(currentStep) ? 'enter' : 'initial'}
				variants={thumbnailVariants}>
				<ViewSweepTable />
			</motion.div>

			<motion.div
				initial={'initial'}
				animate={currentStep === Step.APPROVALS ? 'enter' : 'initial'}
				variants={thumbnailVariants}>
				<ViewApprovalWizard />
			</motion.div>
		</div>
	);
}

export default function Wrapper(): ReactElement {
	return (
		<SweepooorContextApp>
			<Home />
		</SweepooorContextApp>
	);
}

