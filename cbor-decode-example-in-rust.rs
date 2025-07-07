# Charms CBOR Decoding Functions

The following functions are involved in decoding CBOR data from a transaction's witness data to extract a charm (JSON).

## 1. Main CLI Command Implementation

From `charms/src/cli/tx.rs`:

```rust
pub fn tx_show_spell(chain: String, tx: String, json: bool) -> Result<()> {
    let tx = match chain.as_str() {
        BITCOIN => Tx::Bitcoin(BitcoinTx::from_hex(&tx)?),
        CARDANO => Tx::Cardano(CardanoTx::from_hex(&tx)?),
        _ => unimplemented!(),
    };

    match tx::spell(&tx) {
        Some(spell) => cli::print_output(&spell, json)?,
        None => eprintln!("No spell found in the transaction"),
    }

    Ok(())
}
```

## 2. Spell Extraction from Transaction

From `charms/src/tx/mod.rs`:

```rust
#[tracing::instrument(level = "debug", skip_all)]
pub fn norm_spell(tx: &Tx) -> Option<NormalizedSpell> {
    charms_client::tx::extract_and_verify_spell(SPELL_VK, tx)
        .map_err(|e| {
            tracing::debug!("spell verification failed: {:?}", e);
            e
        })
        .ok()
}

#[tracing::instrument(level = "debug", skip_all)]
pub fn spell(tx: &Tx) -> Option<Spell> {
    match norm_spell(tx) {
        Some(norm_spell) => Some(Spell::denormalized(&norm_spell)),
        None => None,
    }
}
```

## 3. CBOR Extraction from Bitcoin Transaction Witness

From `charms/charms-client/src/bitcoin_tx.rs`:

```rust
impl EnchantedTx for BitcoinTx {
    fn extract_and_verify_spell(&self, spell_vk: &str) -> anyhow::Result<NormalizedSpell> {
        let tx = &self.0;

        let Some((spell_tx_in, tx_ins)) = tx.input.split_last() else {
            bail!("transaction does not have inputs")
        };

        let (spell, proof) = parse_spell_and_proof(spell_tx_in)?;

        ensure!(
            &spell.tx.ins.is_none(),
            "spell must inherit inputs from the enchanted tx"
        );
        ensure!(
            &spell.tx.outs.len() <= &tx.output.len(),
            "spell tx outs mismatch"
        );

        let spell = spell_with_ins(spell, tx_ins);

        let (spell_vk, groth16_vk) = crate::tx::vks(spell.version, spell_vk)?;

        Groth16Verifier::verify(
            &proof,
            crate::tx::to_sp1_pv(spell.version, &(spell_vk, &spell)).as_slice(),
            spell_vk,
            groth16_vk,
        )
        .map_err(|e| anyhow!("could not verify spell proof: {}", e))?;

        Ok(spell)
    }
}

#[tracing::instrument(level = "debug", skip_all)]
pub fn parse_spell_and_proof(spell_tx_in: &TxIn) -> anyhow::Result<(NormalizedSpell, Proof)> {
    ensure!(
        spell_tx_in
            .witness
            .taproot_control_block()
            .ok_or(anyhow!("no control block"))?
            .len()
            == 33,
        "the Taproot tree contains more than one leaf: only a single script is supported"
    );

    let leaf_script = spell_tx_in
        .witness
        .taproot_leaf_script()
        .ok_or(anyhow!("no spell data in the last input's witness"))?;

    let mut instructions = leaf_script.script.instructions();

    ensure!(instructions.next() == Some(Ok(Instruction::PushBytes(PushBytes::empty()))));
    ensure!(instructions.next() == Some(Ok(Instruction::Op(OP_IF))));
    let Some(Ok(Instruction::PushBytes(push_bytes))) = instructions.next() else {
        bail!("no spell data")
    };
    if push_bytes.as_bytes() != b"spell" {
        bail!("no spell marker")
    }

    let mut spell_data = vec![];

    loop {
        match instructions.next() {
            Some(Ok(Instruction::PushBytes(push_bytes))) => {
                spell_data.extend(push_bytes.as_bytes());
            }
            Some(Ok(Instruction::Op(OP_ENDIF))) => {
                break;
            }
            _ => {
                bail!("unexpected opcode")
            }
        }
    }

    let (spell, proof): (NormalizedSpell, Proof) = util::read(spell_data.as_slice())
        .map_err(|e| anyhow!("could not parse spell and proof: {}", e))?;
    Ok((spell, proof))
}
```

## 4. CBOR Deserialization Utility

From `charms/charms-data/src/util.rs`:

```rust
/// Deserialize a CBOR value from a reader (e.g. `&[u8]` or `std::io::stdin()`).
pub fn read<T, R>(s: R) -> Result<T>
where
    T: DeserializeOwned,
    R: Read,
    R::Error: Debug + Send + Sync + 'static,
{
    Ok(ciborium::from_reader(s)?)
}

/// Serialize a value to a byte vector as CBOR.
pub fn write<T>(t: &T) -> Result<Vec<u8>>
where
    T: Serialize,
{
    let mut buf = vec![];
    ciborium::into_writer(t, &mut buf)?;
    Ok(buf)
}
```

## 5. Key Data Structures

### NormalizedSpell and Related Types

From `charms/charms-client/src/lib.rs`:

```rust
/// Maps the index of the charm's app (in [`NormalizedSpell`].`app_public_inputs`) to the charm's
/// data.
pub type NormalizedCharms = BTreeMap<u32, Data>;

/// Normalized representation of a Charms transaction.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct NormalizedTransaction {
    /// (Optional) input UTXO list. Is None when serialized in the transaction: the transaction
    /// already lists all inputs. **Must** be in the order of the transaction inputs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ins: Option<Vec<UtxoId>>,

    /// Reference UTXO list. **May** be empty.
    pub refs: BTreeSet<UtxoId>,

    /// Output charms. **Must** be in the order of the transaction outputs.
    /// When proving spell correctness, we can't know the transaction ID yet.
    /// We only know the index of each output charm.
    /// **Must** be in the order of the hosting transaction's outputs.
    /// **Must not** be larger than the number of outputs in the hosting transaction.
    pub outs: Vec<NormalizedCharms>,

    /// Optional mapping from the beamed output index to the destination UtxoId.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub beamed_outs: Option<BTreeMap<u32, B32>>,
}

/// Proof of spell correctness.
pub type Proof = Box<[u8]>;

/// Normalized representation of a spell.
/// Can be committed as public input.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct NormalizedSpell {
    /// Protocol version.
    pub version: u32,
    /// Transaction data.
    pub tx: NormalizedTransaction,
    /// Maps all `App`s in the transaction to (potentially empty) public input data.
    pub app_public_inputs: BTreeMap<App, Data>,
}
```

### Spell and Related Types

From `charms/src/spell.rs`:

```rust
/// Charm as represented in a spell.
/// Map of `$KEY: data`.
pub type KeyedCharms = BTreeMap<String, Data>;

/// UTXO as represented in a spell.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Input {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub utxo_id: Option<UtxoId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub charms: Option<KeyedCharms>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub beamed_from: Option<UtxoId>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Output {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(alias = "sats", skip_serializing_if = "Option::is_none")]
    pub amount: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub charms: Option<KeyedCharms>,
    #[serde(alias = "beamed_to", skip_serializing_if = "Option::is_none")]
    pub beam_to: Option<B32>,
}

/// Defines how spells are represented in their source form and in CLI outputs,
/// in both human-friendly (JSON/YAML) and machine-friendly (CBOR) formats.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Spell {
    /// Version of the protocol.
    pub version: u32,

    /// Apps used in the spell. Map of `$KEY: App`.
    /// Keys are arbitrary strings. They just need to be unique (inside the spell).
    pub apps: BTreeMap<String, App>,

    /// Public inputs to the apps for this spell. Map of `$KEY: Data`.
    #[serde(alias = "public_inputs", skip_serializing_if = "Option::is_none")]
    pub public_args: Option<BTreeMap<String, Data>>,

    /// Private inputs to the apps for this spell. Map of `$KEY: Data`.
    #[serde(alias = "private_inputs", skip_serializing_if = "Option::is_none")]
    pub private_args: Option<BTreeMap<String, Data>>,

    /// Transaction inputs.
    pub ins: Vec<Input>,
    /// Reference inputs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refs: Option<Vec<Input>>,
    /// Transaction outputs.
    pub outs: Vec<Output>,
}
```

### Data Type

From `charms/charms-data/src/lib.rs`:

```rust
/// Represents a data value that is guaranteed to be serialized/deserialized to/from CBOR.
#[derive(Clone, PartialEq, PartialOrd, Serialize, Deserialize)]
pub struct Data(Value);

impl Data {
    /// Create an empty data value.
    pub fn empty() -> Self {
        Self(Value::Null)
    }

    /// Check if the data value is empty.
    pub fn is_empty(&self) -> bool {
        self.0.is_null()
    }

    /// Try to cast to a value of a deserializable type (implementing
    /// `serde::de::DeserializeOwned`).
    pub fn value<T: DeserializeOwned>(&self) -> Result<T> {
        self.0
            .deserialized()
            .map_err(|e| anyhow!("deserialization error: {}", e))
    }

    /// Serialize to bytes.
    pub fn bytes(&self) -> Vec<u8> {
        util::write(&self).expect("serialization should have succeeded")
    }
}
```

## 6. Denormalization Function

From `charms/src/spell.rs`:

```rust
impl Spell {
    /// De-normalize a normalized spell.
    #[tracing::instrument(level = "debug", skip_all)]
    pub fn denormalized(norm_spell: &NormalizedSpell) -> Self {
        let apps = (0..)
            .zip(norm_spell.app_public_inputs.keys())
            .map(|(i, app)| (utils::str_index(&i), app.clone()))
            .collect();

        let public_inputs = match (0..)
            .zip(norm_spell.app_public_inputs.values())
            .filter_map(|(i, data)| match data {
                data if data.is_empty() => None,
                data => Some((
                    utils::str_index(&i),
                    data.value().ok().expect("Data should be a Value"),
                )),
            })
            .collect::<BTreeMap<_, _>>()
        {
            map if map.is_empty() => None,
            map => Some(map),
        };

        let Some(norm_spell_ins) = &norm_spell.tx.ins else {
            unreachable!("spell must have inputs");
        };
        let ins = norm_spell_ins
            .iter()
            .map(|utxo_id| Input {
                utxo_id: Some(utxo_id.clone()),
                charms: None,
                beamed_from: None,
            })
            .collect();

        let refs = match norm_spell
            .tx
            .refs
            .iter()
            .map(|utxo_id| Input {
                utxo_id: Some(utxo_id.clone()),
                charms: None,
                beamed_from: None,
            })
            .collect::<Vec<_>>()
        {
            refs if refs.is_empty() => None,
            refs => Some(refs),
        };

        let outs = norm_spell
            .tx
            .outs
            .iter()
            .zip(0u32..)
            .map(|(n_charms, i)| Output {
                address: None,
                amount: None,
                charms: match n_charms
                    .iter()
                    .map(|(i, data)| {
                        (
                            utils::str_index(i),
                            data.value().ok().expect("Data should be a Value"),
                        )
                    })
                    .collect::<KeyedCharms>()
                {
                    charms if charms.is_empty() => None,
                    charms => Some(charms),
                },
                beam_to: norm_spell
                    .tx
                    .beamed_outs
                    .as_ref()
                    .and_then(|beamed_to| beamed_to.get(&i).cloned()),
            })
            .collect();

        Self {
            version: norm_spell.version,
            apps,
            public_args: public_inputs,
            private_args: None,
            ins,
            refs,
            outs,
        }
    }
}
```

## Summary of the Process

1. The command "charms tx show-spell --tx $tx_hex" parses the transaction hex and creates a `Tx` object.
2. It calls `tx::spell(&tx)` to extract the spell from the transaction.
3. For Bitcoin transactions, it extracts the CBOR-encoded data from the witness script of the last input.
4. The CBOR data is deserialized into a `NormalizedSpell` and `Proof` using the `ciborium` library.
5. The spell is verified using the provided verification key.
6. The normalized spell is then denormalized to a more human-readable format using `Spell::denormalized` and displayed to the user.

## TypeScript Conversion Considerations

For a TypeScript implementation, you would need:

1. A CBOR library for TypeScript (like `cbor-x` or `cbor-web`)
2. Equivalent TypeScript interfaces for all the data structures:
   - `NormalizedSpell`, `NormalizedTransaction`, `NormalizedCharms`
   - `Spell`, `Input`, `Output`, `KeyedCharms`
   - `Data`, `App`, `UtxoId`, `TxId`, `B32`
3. Functions to extract and parse the witness data from a Bitcoin transaction
4. Functions to deserialize the CBOR data into the appropriate TypeScript objects
5. A function to denormalize the spell (equivalent to `Spell::denormalized`)

The most critical parts are the CBOR deserialization and the witness data extraction, as these involve the actual decoding of the charm data.
