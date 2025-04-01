use crate::models::ProveSpellRequest;
use crate::services::spell::SpellProver;
use axum::{http::StatusCode, Json};
use serde_json::{json, Value};
use tracing::error;
#[axum::debug_handler]
pub async fn prove_spell(
    Json(req): Json<ProveSpellRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Validate request
    if req.spell_json.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "status": "error",
                "message": "spell_json is required"
            })),
        ));
    }

    if req.funding_utxo_amount == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "status": "error",
                "message": "funding_utxo_amount must be greater than 0"
            })),
        ));
    }

    // Use mocked proof for testing
    match true {
        true => Ok(Json(json!({
        "status": "success",
        "transactions": {
            "commit_tx": "02000000010ddd5a3398029480e3b88cb5a6a305a13b03093c90fa33af531bed2ebe507a500100000000ffffffff012b060000000000002251205635b0022cba9a9b4e82d53332bf548d3221a3bd03a375fca4f023b9b318a8e000000000",
            "control_block": "",
            "spell_tx": "020000000001020ddd5a3398029480e3b88cb5a6a305a13b03093c90fa33af531bed2ebe507a500000000000ffffffff69757e1710aabcbedc9816d128c972827b99779f9f48886b2ed0d53bac6cf1d60000000000ffffffff02e803000000000000225120bc0e0c64dea568992c5c9a8c3b2333797dbfbca159c1b99d810fb0468f4f37a61e03000000000000225120bc0e0c64dea568992c5c9a8c3b2333797dbfbca159c1b99d810fb0468f4f37a6000341722fcd10e8f68dc7e6a0a18ab8874082d1b43ae3178098ee02c59466e6785688995e548c06899138886962861468d7f5462ef3ef793cd4a4a2f53ca0f5bb399d81fdf2020063057370656c6c4d080282a36776657273696f6e02627478a2647265667380646f75747381a100a2667469636b657268434841524d532d376972656d61696e696e671a000186a0716170705f7075626c69635f696e70757473a183616e982018c21837185318950c18dc0218c418f7184118c918a718e118f518d7181918a51843188c18cd185a18930c184b1867182418ae18ec18550b183b189398201835189300183218d718b818ac131880189f18df1858182d188718df1851185418bc183a185a182018dd18990218421827188b1618ef1839183110f69901041118b618a0189d182e182f189118ba187e183718b007183c184c18aa183c18291833189d183f1855186118420a183d1892181d1885185218821418400101182118aa182518361863185618ea18431828185f18b4185e18cb0318801847186a188618c618d7186e18df18dc18c81618a3184b1889183e18cf18b4182f18e718831820184a184118e0186e1820188b021843186a18dc1856187318c2187618c2184a185a183f181f1618520f18fb18380618891895186f18d218b30a0818741862187618981824183e185c181a18f3184b18e0187a18ff18441865181c18a21857181f186b18fd18481850182f1826189018e5187b183f18870b1819183e187b18c8185818c617187b1856183e18cf185218d818ad0e181e18c318ce18321851182518311821189e186c18b218fa18831840182618a8184cbac50818361852185a18be18bd1865189918c0184e183718fa18ff18b0186818b8183e18e1188618ae188918c2182f187a18fa18681822189218dd18ab17189a181e18fe18c2184c1820187d18e918ed18ba185e182b18af182118aa18391883186918a6141618e4189e1894189118ea18fb18a5182418ad18c71868187818281885186118701853141618f218ce18fb18db18811887186a18d2183c18a6186818d1181a18db18c71865181a189c18f90318b918ac18fd186d18326820314e3435e5e4e2bb03bf2efacde8ed2bfbdee2e7caac2a3664ff8b66b21622f0ac21c0314e3435e5e4e2bb03bf2efacde8ed2bfbdee2e7caac2a3664ff8b66b21622f000000000",
            "taproot_script": ""
        }
        }))),
        false => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({})))),
    }

    // Frontend handles proving now
}
