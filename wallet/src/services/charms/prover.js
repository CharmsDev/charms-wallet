// Service for calling the prove API endpoint

// Triggers the proving process via API endpoint
export async function triggerProve() {
    try {
        // Get wallet API base URL
        const walletApiUrl = process.env.NEXT_PUBLIC_WALLET_API_URL || 'http://localhost:3355';

        // Use exact hardcoded payload string that works with the API
        const payloadString = `{"spell":{"version":2,"apps":{"$0000":"n/1031cfcd548b532c42b3e7cf91eedc94c1ce3f3a06ad1462232b1c7867c3dccc/d39b284ca6bda149e2eff8736bf8a3453cdff13f37cc361418ae572a8b07235f"},"ins":[{"utxo_id":"cd3501e9ec1b381a7ccf4083643ee72198084cc03b0562c920e4a788b00ca92b:0","charms":{"$0000":{"ticker":"CHARMS-13","remaining":100000}}}],"outs":[{"address":"tb1p28mazs76xy6j4xl55ac6e60sddx50qefhpen7fa373ap40km5j4qq3x7m0","charms":{"$0000":{"ticker":"CHARMS-13","remaining":100000}},"sats":1000}]},"binaries":{},"prev_txs":["02000000000102b98d8e42ccd46beb2bb0f50ed7a7eac38cf17d40425e9a0ff584935c8e9816570100000000ffffffff3db4575c2097705cb8c5da6b31c474c96f39ce1766ebe7eb07795b2448ebf7930000000000ffffffff03e803000000000000225120723c718e5eeb94bd2faea3cc04703f561f084622d2e701b05556f8b69ce85c6bb805000000000000225120ff9f32061f3d77df48351293ee8d5c9bb39730004edef0abfdf1c2484ff1b5033b3f000000000000225120c3a59df78627d62f061353fc3eac1b9503272d499c11dae6c1e21bd0cd08d0fc0140d019911e6563450a8d118d6d36124353918b0999c8104f373829e90da6f5a885f6bec32cc268057eb89181dfc3916acfde749c65ecd6b55901ff071afebf2c850341fb0eddaa7c93b200c097fb34738a74fa26c15b00c69534a4c7664073caf45a230af6eed33e567c0ceea830d47acdf823bdb91c68eda841b99a007fcfd137b9e081fdfd020063057370656c6c4d080282a36776657273696f6e02627478a2647265667380646f75747381a100a2667469636b657269434841524d532d31336972656d61696e696e671a000186a0716170705f7075626c69635f696e70757473a183616e982010183118cf18cd1854188b1853182c184218b318e718cf189118ee18dc189418c118ce183f183a0618ad1418621823182b181c1878186718c318dc18cc982018d3189b1828184c18a618bd18a1184918e218ef18f81873186b18f818a31845183c18df18f1183f183718cc183614181818ae1857182a188b071823185ff69901041118b618a0189d182e18c40e18e21869186e1894181b18ec181f18a51857182b186a18fa18fc18d018cb1867187818f7186a18ec184a18e218bb182518ed183a18f918ae18641826189118ad18c8184718c41854189a186318c41864185518d30918b7183318e6183318d918ac185118a018c518f3184418331834185c18de181b189e18f4182d181c181b1006188618d018c8189618b01860184c187c1858189b18751822185a183718d01897181d187d187a1847185118d2182e18f9187118a811181d18c2187f183618c618c918b9181a18d4182f186d182718ef18cb185018ae18f41852186b18c21836189818981854187f18b618de18d8189f18e918bf184b181f18cb1827189a186718f60c1859186318ee18b918ff18df18fa18f2184618a818f518c90104185718251894181f4cc518fc187e185d1833183f183918ab1824184718a1182d184018c6184b18e61870188d18d218b41118cc187918cc18d618e718ad18c5185418ad181e185818e818630218a818f60518e5020f181f18c41862185c18d018fe1861189b186118ba183f182718e1184f188e1829182118e6184818af18d818e018e818b218ed188718e718a3187c0c18e816189118e0186318f518d0171882188218d818691874183c18cc18ec18f0189318bf18fb18b30818a118fd1866186318ed1832189c18b118c6184d18566820a7feb57d2dc80271d5c5c19218dfddbd2d8f4e6286dae417b95669440d4beb0dac21c0a7feb57d2dc80271d5c5c19218dfddbd2d8f4e6286dae417b95669440d4beb0d00000000"],"funding_utxo":"0c0c28c0077cafe2b4491a5c5d654f4c5d9ea8ea7174a78fc8e3bcc3ee1dc8dc:1","funding_utxo_value":77712,"change_address":"tb1plq0hs0keg4acgvaf02k9hwsypr7nm4u0jw7rmf68s0lmknp4qphsml66n6","fee_rate":2}`;

        // Call the prove API endpoint
        const response = await fetch(`${walletApiUrl}/spell/prove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: payloadString
        });

        // Check response status
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to trigger prove: ${response.status} ${response.statusText} - ${errorText}`);
        }

        // Parse response as JSON
        const result = await response.json();

        return {
            status: "success",
            message: "Prove triggered successfully",
            data: result
        };
    } catch (error) {
        return {
            status: "error",
            message: error.message || "Failed to trigger prove"
        };
    }
}

export const proverService = {
    triggerProve
};
