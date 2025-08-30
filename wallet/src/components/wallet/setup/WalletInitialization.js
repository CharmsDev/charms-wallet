'use client';

import { useEffect } from 'react';

export default function WalletInitialization({
    initializationStep,
    initializationProgress,
    onComplete
}) {
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
                        {initializationStep || 'Preparing...'}
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
                            initializationStep.includes('Creating') || initializationStep.includes('Validating')
                                ? 'bg-primary-500'
                                : initializationStep.includes('Deriving') || initializationStep.includes('Generating') || initializationStep.includes('Saving') || initializationStep.includes('Scanning') || initializationStep.includes('Refreshing') || initializationStep.includes('Processing') || initializationStep.includes('Finalizing')
                                    ? 'bg-green-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            initializationStep.includes('Creating') || initializationStep.includes('Validating')
                                ? 'text-primary-400 font-medium'
                                : initializationStep.includes('Deriving') || initializationStep.includes('Generating') || initializationStep.includes('Saving') || initializationStep.includes('Scanning') || initializationStep.includes('Refreshing') || initializationStep.includes('Processing') || initializationStep.includes('Finalizing')
                                    ? 'text-green-400'
                                    : 'text-gray-400'
                        }`}>
                            Create wallet & seed phrase
                        </span>
                    </div>

                    {/* Step 2: Derive wallet information */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            initializationStep.includes('Deriving')
                                ? 'bg-primary-500'
                                : initializationStep.includes('Generating') || initializationStep.includes('Saving') || initializationStep.includes('Scanning') || initializationStep.includes('Refreshing') || initializationStep.includes('Processing') || initializationStep.includes('Finalizing')
                                    ? 'bg-green-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            initializationStep.includes('Deriving')
                                ? 'text-primary-400 font-medium'
                                : initializationStep.includes('Generating') || initializationStep.includes('Saving') || initializationStep.includes('Scanning') || initializationStep.includes('Refreshing') || initializationStep.includes('Processing') || initializationStep.includes('Finalizing')
                                    ? 'text-green-400'
                                    : 'text-gray-400'
                        }`}>
                            Derive wallet information
                        </span>
                    </div>

                    {/* Step 3: Generate addresses */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            initializationStep.includes('Generating') || initializationStep.includes('Saving')
                                ? 'bg-primary-500'
                                : initializationStep.includes('Scanning') || initializationStep.includes('Refreshing') || initializationStep.includes('Processing') || initializationStep.includes('Finalizing')
                                    ? 'bg-green-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            initializationStep.includes('Generating') || initializationStep.includes('Saving')
                                ? 'text-primary-400 font-medium'
                                : initializationStep.includes('Scanning') || initializationStep.includes('Refreshing') || initializationStep.includes('Processing') || initializationStep.includes('Finalizing')
                                    ? 'text-green-400'
                                    : 'text-gray-400'
                        }`}>
                            Generate addresses
                        </span>
                    </div>

                    {/* Step 4: Scan addresses */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            initializationStep.includes('Scanning') || initializationStep.includes('Refreshing')
                                ? 'bg-primary-500'
                                : initializationStep.includes('Processing') || initializationStep.includes('Finalizing')
                                    ? 'bg-green-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            initializationStep.includes('Scanning') || initializationStep.includes('Refreshing')
                                ? 'text-primary-400 font-medium'
                                : initializationStep.includes('Processing') || initializationStep.includes('Finalizing')
                                    ? 'text-green-400'
                                    : 'text-gray-400'
                        }`}>
                            Scan addresses
                        </span>
                    </div>

                    {/* Step 5: Scan for Charms */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            initializationStep.includes('Processing') && initializationStep.includes('Charms')
                                ? 'bg-primary-500'
                                : initializationStep.includes('Finalizing')
                                    ? 'bg-green-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            initializationStep.includes('Processing') && initializationStep.includes('Charms')
                                ? 'text-primary-400 font-medium'
                                : initializationStep.includes('Finalizing')
                                    ? 'text-green-400'
                                    : 'text-gray-400'
                        }`}>
                            Scan for Charms
                        </span>
                    </div>

                    {/* Step 6: Finalize setup */}
                    <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                            initializationStep.includes('Finalizing')
                                ? 'bg-primary-500'
                                : initializationStep.includes('Finalizing') && progressPercentage === 100
                                    ? 'bg-green-500'
                                    : 'bg-gray-600'
                        }`}></div>
                        <span className={`text-sm ${
                            initializationStep.includes('Finalizing')
                                ? 'text-primary-400 font-medium'
                                : initializationStep.includes('Finalizing') && progressPercentage === 100
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
