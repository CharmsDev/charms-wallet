import { WALLET_API_URL } from '@services/shared/constants';
import type { TransferCharmsResponse } from '@app-types/transaction';

export class TransferCharmsService {
    private readonly API_URL = `${WALLET_API_URL}/spell/prove_spell`;

    /**
     * Transfers charms to a recipient using a spell
     * @returns Promise with transfer response
     */
    async transferCharms(
        recipient: string,
        amount: number,
        spellJson: string,
        fundingUtxoId: string
    ): Promise<TransferCharmsResponse> {
        // Validate essential inputs
        if (!recipient?.trim() || !spellJson?.trim() || !fundingUtxoId?.trim()) {
            throw new Error('Missing required parameters: recipient, spell, or funding UTXO');
        }

        // Verify spell format has required sections
        if (!this.isValidSpellFormat(spellJson)) {
            throw new Error('Invalid spell format: missing required sections');
        }

        try {
            // Log condensed request info for debugging
            console.log('Transfer request:', { recipient, amount, fundingUtxoId });

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    spell_json: spellJson,
                    funding_utxo_id: fundingUtxoId,
                    destination_address: recipient
                })
            });

            const data = await response.json();

            // Log response status for debugging
            console.log('Transfer status:', response.status, response.statusText);

            if (!response.ok) {
                throw new Error(data?.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            return data;
        } catch (error: any) {
            // Format error with context for better debugging
            const errorMessage = this.formatErrorMessage(error);
            console.error('Transfer failed:', errorMessage);
            throw new Error(errorMessage);
        }
    }

    /**
     * Validates if spell JSON contains required sections
     */
    private isValidSpellFormat(spellJson: string): boolean {
        return ['version:', 'apps:', 'ins:', 'outs:'].every(section =>
            spellJson.includes(section)
        );
    }

    /**
     * Formats error message with available context
     */
    private formatErrorMessage(error: any): string {
        // Handle network connectivity errors
        if (error.response?.status === 0) {
            return 'Network error: Unable to reach the server';
        }

        // Extract the most specific error message available
        const message = error.response?.data?.message ||
            error.response?.data?.error ||
            error.message ||
            'Transfer request failed';

        // Include HTTP status when available
        return error.response?.status
            ? `Transfer failed (${error.response.status}): ${message}`
            : `Transfer failed: ${message}`;
    }
}

export const transferCharmsService = new TransferCharmsService();