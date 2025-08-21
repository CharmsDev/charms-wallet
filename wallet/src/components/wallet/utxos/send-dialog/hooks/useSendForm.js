import { useState } from 'react';

export function useSendForm() {
    const [destinationAddress, setDestinationAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [feeRate, setFeeRate] = useState(5);
    const [error, setError] = useState('');

    const resetForm = () => {
        setDestinationAddress('');
        setAmount('');
        setError('');
    };

    return {
        destinationAddress,
        setDestinationAddress,
        amount,
        setAmount,
        feeRate,
        setFeeRate,
        error,
        setError,
        resetForm
    };
}
