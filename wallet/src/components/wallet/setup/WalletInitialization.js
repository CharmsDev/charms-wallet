'use client';

import { useEffect } from 'react';

export default function WalletInitialization({
    initializationStep,
    initializationProgress,
    onComplete
}) {
    const [currentStep, setCurrentStep] = useState(0);
    const [currentMessage, setCurrentMessage] = useState('');

    const handleStepChange = (step, message) => {
        setCurrentStep(step);
        setCurrentMessage(message);
    };

    const newStepStates = initializationSteps.map((_, index) => {
        if (index < currentStep) {
            return 'completed';
        } else if (index === currentStep) {
            return 'active';
        } else {
            return 'pending';
        }
    });

    // Auto-complete when progress reaches 100%
    useEffect(() => {
        if (initializationProgress.current === initializationProgress.total &&
            initializationProgress.total > 0 &&
            initializationStep.includes('Finalizing')) {
            // Small delay before transitioning to show completion
            const timer = setTimeout(() => {
                onComplete();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [initializationProgress, initializationStep, onComplete]);

    const progressPercentage = initializationProgress.total > 0
        ? (initializationProgress.current / initializationProgress.total) * 100
        : 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex flex-col items-center justify-center px-4 z-50">
            <div className="w-full max-w-md card p-8 space-y-8">
                <h1 className="text-2xl font-bold text-center gradient-text mb-6">
                    Initializing Wallet
                </h1>

                {/* Progress Circle */}
                <div className="flex justify-center mb-6">
                    <div className="relative w-24 h-24">
                        {/* Background circle */}
                        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                            <circle
                                cx="50"
                                cy="50"
                                r="40"
                                stroke="#374151"
                                strokeWidth="8"
                                fill="none"
                            />
                            {/* Progress circle */}
                            <circle
                                cx="50"
                                cy="50"
                                r="40"
                                stroke="#3b82f6"
                                strokeWidth="8"
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 40}`}
                                strokeDashoffset={`${2 * Math.PI * 40 * (1 - progressPercentage / 100)}`}
                                className="transition-all duration-300 ease-out"
                            />
                        </svg>
                        {/* Percentage text */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-semibold text-white">
                                {Math.round(progressPercentage)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Current Step */}
                <div className="text-center space-y-4">
                    <p className="text-lg font-medium text-gray-300">
                        {currentMessage || 'Preparing...'}
                    </p>

                    {/* Progress bar for address generation */}
                    {initializationProgress.total > 0 && (
                        <div className="w-full">
                            <div className="flex justify-between text-sm text-gray-400 mb-2">
                                <span>Progress</span>
                                <span>{initializationProgress.current}/{initializationProgress.total}</span>
                            </div>
                            <div className="w-full bg-dark-700 rounded-full h-2">
                                <div
                                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progressPercentage}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Steps indicator */}
                <div className="space-y-3">
                    {/* Step 1: Create wallet & seed phrase */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            newStepStates[0] === 'completed'
                                ? 'bg-green-500'
                                : newStepStates[0] === 'active'
                                    ? 'bg-primary-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            newStepStates[0] === 'completed'
                                ? 'text-green-400'
                                : newStepStates[0] === 'active'
                                    ? 'text-primary-400 font-medium'
                                    : 'text-gray-400'
                        }`}>
                            Create wallet & seed phrase
                        </span>
                    </div>

                    {/* Step 2: Derive wallet information */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            newStepStates[1] === 'completed'
                                ? 'bg-green-500'
                                : newStepStates[1] === 'active'
                                    ? 'bg-primary-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            newStepStates[1] === 'completed'
                                ? 'text-green-400'
                                : newStepStates[1] === 'active'
                                    ? 'text-primary-400 font-medium'
                                    : 'text-gray-400'
                        }`}>
                            Derive wallet information
                        </span>
                    </div>

                    {/* Step 3: Generate addresses */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            newStepStates[2] === 'completed'
                                ? 'bg-green-500'
                                : newStepStates[2] === 'active'
                                    ? 'bg-primary-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            newStepStates[2] === 'completed'
                                ? 'text-green-400'
                                : newStepStates[2] === 'active'
                                    ? 'text-primary-400 font-medium'
                                    : 'text-gray-400'
                        }`}>
                            Generate addresses
                        </span>
                    </div>

                    {/* Step 4: Scan addresses */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            newStepStates[3] === 'completed'
                                ? 'bg-green-500'
                                : newStepStates[3] === 'active'
                                    ? 'bg-primary-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            newStepStates[3] === 'completed'
                                ? 'text-green-400'
                                : newStepStates[3] === 'active'
                                    ? 'text-primary-400 font-medium'
                                    : 'text-gray-400'
                        }`}>
                            Scan addresses
                        </span>
                    </div>

                    {/* Step 5: Scan for Charms */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            newStepStates[4] === 'completed'
                                ? 'bg-green-500'
                                : newStepStates[4] === 'active'
                                    ? 'bg-primary-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            newStepStates[4] === 'completed'
                                ? 'text-green-400'
                                : newStepStates[4] === 'active'
                                    ? 'text-primary-400 font-medium'
                                    : 'text-gray-400'
                        }`}>
                            Scan for Charms
                        </span>
                    </div>

                    {/* Step 6: Scan for transaction history */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            newStepStates[5] === 'completed'
                                ? 'bg-green-500'
                                : newStepStates[5] === 'active'
                                    ? 'bg-primary-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            newStepStates[5] === 'completed'
                                ? 'text-green-400'
                                : newStepStates[5] === 'active'
                                    ? 'text-primary-400 font-medium'
                                    : 'text-gray-400'
                        }`}>
                            Scan for transaction history
                        </span>
                    </div>

                    {/* Step 7: Finalize setup */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            newStepStates[6] === 'completed'
                                ? 'bg-green-500'
                                : newStepStates[6] === 'active'
                                    ? 'bg-primary-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            initializationStep.includes('Finalize setup')
                                ? 'text-primary-400 font-medium'
                                : progressPercentage === 100
                                    ? 'text-green-400'
                                    : 'text-gray-400'
                        }`}>
                            Finalize setup
                        </span>
                    </div>
                </div>

                {/* Loading animation */}
                <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                </div>
            </div>
        </div>
    );
}
