# CLMM Testnet Flow Record

Date: 2026-07-23
Network: Stellar testnet
Source account: `wraith-clmm`
Admin address: `GBSIHXDRLMMO3Q33DTMQTU6ZWO2Y2Q2E5LCX6FWUFWLY3XDSZKWTEYJG`

## Toolchain

- `stellar` CLI: `27.0.0`
- `cargo`: `1.91.0`
- Contract build toolchain: `STELLAR_RUSTUP_TOOLCHAIN=1.92.0`
- `nargo`: `1.0.0-beta.9`
- `bb`: `0.87.0`

## Deployed Contracts

Deployment manifest: `deployments.clmm.testnet.json`

| Component | Contract ID | Transaction |
| --- | --- | --- |
| Merkle tree | `CAKWRKQZRAJGTQCRYLXLEPP6EMQGBKSQIAWKRNT2VM24XGURMAZKYFKN` | `5ae62ebdaa27f959b0a5d34dbfe7046d8af0bc2c28adc9626b39d85de597d1ba` |
| Mint verifier | `CBMNUXB4YJ4MGFZMCHUNVGNF5BNFUYES3KBBC3XQWRU4BFVNVBKM56JD` | `71e0944217353f89139046615e71e523af276eebb78a713c82381ae199d8dd12` |
| Burn verifier | `CB47QVMKMEYYZT2MEQXLVUTFPFKXYEM6PGG4KUC5RKAE3ETIEDXC25IS` | `f9734d6dc4f09a2e95d7c3560f0a5c48fc8f3357cd44eecf6477a1e2b4764293` |
| Swap verifier | `CBK4USMLA5DNCTNESR3DZTRPZZXWFPXLX4Q6BQZU7SYBUC6MR4RLZA5P` | `748e74f79d84cb88c4c0adaa5d0108b70c1caaff3a74856ee9da8b651f48edbe` |
| Collect verifier | `CAEDI7SGCMNPALUIM3TZAOTVIQWSP3KVPPGXXQPNPD3GPLDRC4PD345Q` | `3d18d31c5766486612e618ae3c93e5f362f05d6241bf0ccb580371fd06b0e538` |
| CLMM upload | `0a4d48682c99e01bb4776e6fe78d3d35dd92337908e8d0e4197aca57226d74be` | `0dd41fd3db322ee1cc5d031c94f5937c6267d530abc6b3643798ca96e211ea4f` |
| CLMM | `CDKX4IEV7G5J3LGL3M6VC3NUP6ROLVPYPLCCXEXCIBTR7D3VNA22IW3I` | `e1182a0b021651ad2040ae214ca41cc375faf5af966c44ce338281b481701412` |
| Set Merkle authorized inserter | `CDKX4IEV7G5J3LGL3M6VC3NUP6ROLVPYPLCCXEXCIBTR7D3VNA22IW3I` | `20961a3bcd1c64fe6f3e9f05685cb4d60c1c82af5f0deaee46f8c88b6823728e` |
| Faucet token DTA0 | `CABVWICE5Z7NLX4HCTI4SHAQPXYWOFLNNXFFU7FRHVZ55CJ77YHM7FEJ` | `26d608f0829269d9b89af05ded4c4e684ffceab4511ed428b083dfe51d1c976f` |
| Faucet token DTA1 | `CA7ELH7YGTFLM7BLWTLEDH2UHEDZ226ZL6NNCN6MNJW2UK4S54YJIVWD` | `9087f3206d784a99bfe988b34824070002900f54da4d8edc3a089422ba8b55c4` |

## 2026-07-24 CLMM Asset Address Redeploy

The initial CLMM pool interface accepted token arguments but stored placeholder numeric asset IDs. The rebuilt CLMM now stores real Stellar token contract addresses in `PoolState.asset_0` and `PoolState.asset_1`, emits those addresses in `PoolCreatedEvent`, and rejects identical token pairs.

Current CLMM contract: `CDRRSRJQ4YMBCQVBCTBLCGO7FP43XN65RDNWZ724CBFQKNXVLUYD2VKN`

| Step | Result | Transaction |
| --- | --- | --- |
| CLMM upload | Wasm hash `4dc1b715e21601c352e76de38267ea2da465c54a82f0f17aad231c8d51ff1d19` | `7a70aabbd48fdee4ad1aff20ee6728dd8aada791664b32cc347ec9dca717a690` |
| CLMM deploy | `CDRRSRJQ4YMBCQVBCTBLCGO7FP43XN65RDNWZ724CBFQKNXVLUYD2VKN` | `c980bd676327e2914b04e6ce5c7302e2aba76e66f25432df094beef3df55c9e8` |
| Set Merkle authorized inserter | `CDRRSRJQ4YMBCQVBCTBLCGO7FP43XN65RDNWZ724CBFQKNXVLUYD2VKN` | `1b9e38698b7a6ce4762493f163e091c27de3be40ffc14dcaada26f7dea5302c2` |
| Create DTA0 / DTA1 pool | Pool ID `1` | `edeafb90dfbe737e073263ab986863520e431a6af43c1a7aad0ce0fb8d610c17` |
| Public mint liquidity sanity check | `[0,0]` | `b0254f77474f9c342f0cd3c7b3749b33057dee31ad2226b14babcb39cf131151` |

Pool `1` state after redeploy:

- `asset_0`: `CABVWICE5Z7NLX4HCTI4SHAQPXYWOFLNNXFFU7FRHVZ55CJ77YHM7FEJ`
- `asset_1`: `CA7ELH7YGTFLM7BLWTLEDH2UHEDZ226ZL6NNCN6MNJW2UK4S54YJIVWD`
- `fee`: `30`
- `tick_spacing`: `100`
- `sqrt_price`: `79228162512`
- `liquidity`: `1000000000`
- `sequence`: `1`

## 2026-07-24 Security Patch Redeploy

Security fixes applied:

- `mint_public` now requires owner authorization and transfers real token amounts into CLMM escrow.
- `burn_public` now requires owner authorization, uses owner-scoped position keys, and transfers real token amounts out of CLMM escrow.
- Public positions are keyed by `(owner, pool_id, tick_lower, tick_upper)`.
- Protocol fee setters now require the configured constructor admin.
- Protocol fee claims require the configured recipient.
- Shielded `mint`, `swap`, `burn`, and `collect` now reject nonexistent pools, reject zero nullifiers, and require the proof's Merkle root to match the current Merkle tree root before state changes.
- Faucet token `transfer` now uses the standard `Address` recipient shape used by `soroban_sdk::token::Client`.

Current secure CLMM contract: `CCE4EP4O46OE5Z6FNYOYZ7IVXOQ36CWIU5RPHACLY3MDRQQFFAD5RPVJ`

Current test tokens:

- DTA0: `CBZOAV2A7OCCKPV6CPAVCXRR6MCFMGY5DXJWWIPFC6DH6QBPAF6AQDEM`
- DTA1: `CC74MOR6WHJ3ZV3QFFGBT2Y5XE5HZQPRTRPI3PBAOZDGQBWFKDRB6BVU`

| Step | Result | Transaction |
| --- | --- | --- |
| Faucet token wasm upload | Wasm hash `5e76e4b12fba3f8fdda4053567cc36c85f5d26961f87d7b7e929d323dadaab5e` | `9cca6eee5d44fab9e9269fde1b5c5546a97799e8b0aecaf63328e515f05954b4` |
| DTA0 deploy | `CBZOAV2A7OCCKPV6CPAVCXRR6MCFMGY5DXJWWIPFC6DH6QBPAF6AQDEM` | `89908532af6d9e5f89eb3f113cc423cd724a93ecd6ab17bc8c9416a7e07b5260` |
| DTA1 deploy | `CC74MOR6WHJ3ZV3QFFGBT2Y5XE5HZQPRTRPI3PBAOZDGQBWFKDRB6BVU` | `4833cd3fb1c80305376cb7a1c0e515eb01306e117267131aa206afb640682a4c` |
| CLMM upload | Wasm hash `fb68af339e5e565f4299524fc2e11bc2b9cca2a6f1ca366cf854919342776aa5` | `f8cc4b6974d825071a14042f7700b2b90787f6cf612a4c8d67f991e95395d51d` |
| CLMM deploy | `CCE4EP4O46OE5Z6FNYOYZ7IVXOQ36CWIU5RPHACLY3MDRQQFFAD5RPVJ` | `a0f9e9a52a4a0f2878b38a2e986d8e013f22ce4f4327da7eced3a01448b895a2` |
| Set Merkle authorized inserter | `CCE4EP4O46OE5Z6FNYOYZ7IVXOQ36CWIU5RPHACLY3MDRQQFFAD5RPVJ` | `2dbf3d7889350e2999b45e9ff35063ee27ee2ea2190f03f548525d7c78c11448` |
| Create DTA0 / DTA1 pool | Pool ID `1` | `45f2a3b070508be8845912a8353b3594341b5df0ef0b2800eacf5f82ecc3346f` |
| Mint DTA0 to deployer | Balance funded | `ca2a757744cebb1a844f2612373134faf5fcdb79c8d4bc3bcf99e6857ae7eb88` |
| Mint DTA1 to deployer | Balance funded | `c2a868013dbef8e9b446eda99c3b56d81457988462f78a893a15a41111783736` |
| Public mint with escrow | Deposited `100000000` DTA0 and `100000000` DTA1, minted `1000000000` liquidity | `1ce61eb0f8853bf4d72d7618db5d96f1b3c12df9d21827cebb98d29ea4702cd3` |
| Public burn with escrow | Burned `100000000` liquidity, withdrew `10000000` DTA0 and `10000000` DTA1 | `ce160a0ec70b7ecb3d46cd7d8f010d27eafb98659649d5dc03e03c0ffcdf343d` |

Final secure pool state:

- `asset_0`: `CBZOAV2A7OCCKPV6CPAVCXRR6MCFMGY5DXJWWIPFC6DH6QBPAF6AQDEM`
- `asset_1`: `CC74MOR6WHJ3ZV3QFFGBT2Y5XE5HZQPRTRPI3PBAOZDGQBWFKDRB6BVU`
- `liquidity`: `900000000`
- `sequence`: `2`
- CLMM DTA0 escrow balance: `90000000`
- CLMM DTA1 escrow balance: `90000000`
- Deployer DTA0 balance: `9910000000`
- Deployer DTA1 balance: `9910000000`

## 2026-07-24 Pool State Binding Redeploy

Additional security fix:

- Shielded `mint`, `swap`, and `burn` now require public input `pool_state_old` to equal the live on-chain pool-state commitment before nullifiers are spent or output commitments are inserted.
- The pool-state commitment is Poseidon2 over `(pool_id, asset_0_address_field, asset_1_address_field, sqrt_price, liquidity, fee_growth_global_0, fee_growth_global_1, sequence)`.
- `collect` still needs a circuit ABI update because the current collect public inputs do not expose a pool-state field.

Current state-bound CLMM contract: `CCOSWHHABUKQXFYK3WEZFEIIQNIZXPVSBESFBQH64RFIAYZ7ZRCPQGLF`

| Step | Result | Transaction |
| --- | --- | --- |
| CLMM upload | Wasm hash `e00eea8f77cae21337f83625e0fe8f94333681050c0dab47f7ee6a680ca5179f` | `915d2b3af7821b67f4d4241ba5f53b440575e80663de48ec681f9ab98b190986` |
| CLMM deploy | `CCOSWHHABUKQXFYK3WEZFEIIQNIZXPVSBESFBQH64RFIAYZ7ZRCPQGLF` | `1f0e9a1ec9b9b39466e1d6ae0eadcfba09e6da3b0f4be5277377f788ccc1f170` |
| Set Merkle authorized inserter | `CCOSWHHABUKQXFYK3WEZFEIIQNIZXPVSBESFBQH64RFIAYZ7ZRCPQGLF` | `d4be6c4d162facd8624227126379ac145addd6d7839f8b25ce091bebbb89789d` |
| Create DTA0 / DTA1 pool | Pool ID `1` | `75476b0ddbc8792a903477b92e63fb1353ac145b8bb899310588b099efc827e9` |
| Public mint with escrow | Deposited `100000000` DTA0 and `100000000` DTA1, minted `1000000000` liquidity | `aa5cbc34d334ef3be7a5919e70fee280007ed79c022e1224173ce141d1f55af6` |
| Public burn with escrow | Burned `100000000` liquidity, withdrew `10000000` DTA0 and `10000000` DTA1 | `30c47e71ce2e6009cdb79da1be3a82d0f51ec16c6e0c9351f760a94ac721a705` |

Final state-bound pool state:

- `asset_0`: `CBZOAV2A7OCCKPV6CPAVCXRR6MCFMGY5DXJWWIPFC6DH6QBPAF6AQDEM`
- `asset_1`: `CC74MOR6WHJ3ZV3QFFGBT2Y5XE5HZQPRTRPI3PBAOZDGQBWFKDRB6BVU`
- `liquidity`: `900000000`
- `sequence`: `2`
- CLMM DTA0 escrow balance: `90000000`
- CLMM DTA1 escrow balance: `90000000`
- Deployer DTA0 balance: `9820000000`
- Deployer DTA1 balance: `9820000000`

## 2026-07-24 Verifier-Bound Pool State Redeploy

Additional verifier fixes:

- `clmm_mint`, `clmm_swap_exact_in`, and `clmm_burn` circuits now constrain their public `pool_state_old` input to the same pool-state commitment checked by the CLMM contract.
- New VKs were generated for those three circuits and deployed as fresh UltraHonk verifier contracts.
- `clmm_collect` is still using the previous verifier because its current public input ABI does not include the pool-state commitment. That is the next required circuit ABI change.

Current verifier-bound CLMM contract: `CDYTALL4S6ER6TU2DELDVGVUCB6Y5BBSXP4FSNQOF3ERJ2DQKT3X3PY5`

Current verifier contracts:

- Mint: `CAPSXHJY736PALAGUYU2UJR5RGUJGSROQ2QG32H2NUT6AJRYPT4GSCZS`
- Swap exact in: `CDN6OLZBZWK3INPRHP2UBJQYZIYRLQ24U2RMIHM6B2WVE4WHGSLRM2BX`
- Burn: `CCMSNKOJOJJPDZUJYEEUMNWNEH7SYO4XBTH77CV7V7N45ZZQAGLUBHJJ`
- Collect: `CAEDI7SGCMNPALUIM3TZAOTVIQWSP3KVPPGXXQPNPD3GPLDRC4PD345Q`

| Step | Result | Transaction |
| --- | --- | --- |
| Mint verifier deploy | `CAPSXHJY736PALAGUYU2UJR5RGUJGSROQ2QG32H2NUT6AJRYPT4GSCZS` | `de2894966f311ba90b81b63f96b35fc6cd7541bc529c5c6738a300c51e45998f` |
| Swap verifier deploy | `CDN6OLZBZWK3INPRHP2UBJQYZIYRLQ24U2RMIHM6B2WVE4WHGSLRM2BX` | `8de633d9caef0691350f65f41ed7c76b78bcf59784207dd9e7bdbe157573344d` |
| Burn verifier deploy | `CCMSNKOJOJJPDZUJYEEUMNWNEH7SYO4XBTH77CV7V7N45ZZQAGLUBHJJ` | `94c06682406a74cb9fd2df81e25ac27c5538fdf830cf28739cef0dd3a1bd25d9` |
| CLMM deploy | `CDYTALL4S6ER6TU2DELDVGVUCB6Y5BBSXP4FSNQOF3ERJ2DQKT3X3PY5` | `1688aa492649ec2347b06fb2585248da630ce0ea11753f560218ded8fd6e7758` |
| Set Merkle authorized inserter | `CDYTALL4S6ER6TU2DELDVGVUCB6Y5BBSXP4FSNQOF3ERJ2DQKT3X3PY5` | `437f97612c030c5167a61223f5eb1eff6094092d1131c3a0e12fd39698c16836` |
| Create DTA0 / DTA1 pool | Pool ID `1` | `4c9012615cbab102fe13fdd14627ade9a8d7481a96114bbd1b3e2b1cda29f060` |
| Public mint with escrow | Deposited `100000000` DTA0 and `100000000` DTA1, minted `1000000000` liquidity | `eccf1196d8224d043b3bbf313b39c87290d8918a91143d7fa4d747b046de6d4d` |
| Public burn with escrow | Burned `100000000` liquidity, withdrew `10000000` DTA0 and `10000000` DTA1 | `17b1534d39ef772d7ad958d3c41a8805375430b9b5b579b047ad5f74ab4f43a6` |

Final verifier-bound pool state:

- `asset_0`: `CBZOAV2A7OCCKPV6CPAVCXRR6MCFMGY5DXJWWIPFC6DH6QBPAF6AQDEM`
- `asset_1`: `CC74MOR6WHJ3ZV3QFFGBT2Y5XE5HZQPRTRPI3PBAOZDGQBWFKDRB6BVU`
- `liquidity`: `900000000`
- `sequence`: `2`
- CLMM DTA0 escrow balance: `90000000`
- CLMM DTA1 escrow balance: `90000000`
- Deployer DTA0 balance: `9730000000`
- Deployer DTA1 balance: `9730000000`

## 2026-07-24 Collect Pool State Binding Redeploy

Final verifier fix:

- `clmm_collect` now exposes public `pool_state_old` and constrains it to the same pool-state commitment checked by the CLMM contract.
- All four shielded entrypoints now reject stale pool-state public inputs before nullifier spending or Merkle insertion.

Current final CLMM contract: `CAL53XWYTWPXSTLEQLFCSIV2ZOSMCAR5WPNXPXM4KTOYUGPURFVPWUX3`

Current verifier contracts:

- Mint: `CAPSXHJY736PALAGUYU2UJR5RGUJGSROQ2QG32H2NUT6AJRYPT4GSCZS`
- Swap exact in: `CDN6OLZBZWK3INPRHP2UBJQYZIYRLQ24U2RMIHM6B2WVE4WHGSLRM2BX`
- Burn: `CCMSNKOJOJJPDZUJYEEUMNWNEH7SYO4XBTH77CV7V7N45ZZQAGLUBHJJ`
- Collect: `CBO4MXUFTPWZYE3RLUOPVITZ6TBTNKDSCTZOT2QQLBK2GV72LGS5KNIO`

| Step | Result | Transaction |
| --- | --- | --- |
| Collect verifier deploy | `CBO4MXUFTPWZYE3RLUOPVITZ6TBTNKDSCTZOT2QQLBK2GV72LGS5KNIO` | `746b4e4a1ee3faf6d10fe61933cb654ab03c687ac6b6337af12025dd43234627` |
| CLMM upload | Wasm hash `5d95321f0ec563a09bcf2403a1108f3b3ad104f3e2fab94a474cc0c43ba9569e` | `3aef2cc52a852368a0db3bc54c264f3a872b84c76762b0b93da83f3250b38088` |
| CLMM deploy | `CAL53XWYTWPXSTLEQLFCSIV2ZOSMCAR5WPNXPXM4KTOYUGPURFVPWUX3` | `150ab7a616846cd0110a532c4a5f44f2a31d00a54d40a68bb0bd5a9a52747900` |
| Set Merkle authorized inserter | `CAL53XWYTWPXSTLEQLFCSIV2ZOSMCAR5WPNXPXM4KTOYUGPURFVPWUX3` | `9b017479b8cc697918dfa56a433caa2670d4c56b53701a274ff85c97489ef351` |
| Create DTA0 / DTA1 pool | Pool ID `1` | `649d926d4329eb4beca533815be3190313c4324f7f027082f162b477338dfb55` |
| Public mint with escrow | Deposited `100000000` DTA0 and `100000000` DTA1, minted `1000000000` liquidity | `c37c780eab959dae1a6d0aba832bbbe03b815210d7cf922d76b91e26a15b4b8c` |
| Public burn with escrow | Burned `100000000` liquidity, withdrew `10000000` DTA0 and `10000000` DTA1 | `715f7079a61ca5ff2332a5ecf659462882a90f4a2017580d7b010cac06136037` |
| Admin claim protocol fees | `[0,0]` | `ea801ad82bb96274816033d4c82cf5edba6adf29ad5f123d90785921f1f0287a` |

Final collect-bound pool state:

- `asset_0`: `CBZOAV2A7OCCKPV6CPAVCXRR6MCFMGY5DXJWWIPFC6DH6QBPAF6AQDEM`
- `asset_1`: `CC74MOR6WHJ3ZV3QFFGBT2Y5XE5HZQPRTRPI3PBAOZDGQBWFKDRB6BVU`
- `liquidity`: `900000000`
- `sequence`: `2`
- CLMM DTA0 escrow balance: `90000000`
- CLMM DTA1 escrow balance: `90000000`

## Real Proof Artifacts

The flow used real client/prover outputs from Noir and Barretenberg. Artifacts are under `circuits/artifacts/<circuit>/`.

| Circuit | Proof | Public inputs | VK |
| --- | ---: | ---: | ---: |
| `clmm_mint` | 14592 bytes | 224 bytes | 1760 bytes |
| `clmm_swap_exact_in` | 14592 bytes | 160 bytes | 1760 bytes |
| `clmm_collect` | 14592 bytes | 224 bytes | 1760 bytes |
| `clmm_burn` | 14592 bytes | 256 bytes | 1760 bytes |

## Flow Transactions

| Step | Result | Transaction |
| --- | --- | --- |
| Create pool | Pool ID `1` | `ac7805b15af76fada717151355ff6a06770b963b27abc657f8d6e035d7b9873f` |
| Mint | `[1,"0c8293f676138583eb8b1cc70c239a0cd8b216c483e3847540b1769c5b8c353b"]` | `8014e86bfa56e9c914db4849f479e0dc4927615b18218552f7d745397d0471bf` |
| Swap exact in | `[0,"1867b41a55993c6214d81cddb753b1ffd7c916ff416af2f8ad2334b6d516f4eb"]` | `4413802e39f8a3c310837585f9ae380be06cb503eaf8a9cce2f327a47069fbbd` |
| Collect fees | `[0,0,"06f3507f3dfbf95de6199ebfbb59d4b8cdf4b7a34bec69fa0f6a21d1e29fdf99","2b474d1b1c84ca7ee8630450e5d75083dd09ad9abef893710b6c21ec28913476"]` | `b00d2dfa256740536987d7057eaff169f6d612dfea6891ab7681455f63b9a4eb` |
| Burn | `[4,"2dd4922771c7aa40117eebf3df979f8c05546d1a8424e82c55c0ee3cbf32c5e4","06f3507f3dfbf95de6199ebfbb59d4b8cdf4b7a34bec69fa0f6a21d1e29fdf99","2b474d1b1c84ca7ee8630450e5d75083dd09ad9abef893710b6c21ec28913476"]` | `9b14975dce7bfb08fe040143df0331116ec9c3571d7d24f2f31ff57700ca236d` |
| Admin claim protocol fees | `[0,0]` | `6d4b078af1a8c4dce628f5698df1ee2e0ca4d2a4bb58e6bc8483ce6b0ee19468` |

## Final State Checks

- `get_pool_sequence --pool_id 1`: `4`
- Merkle `get_leaf_count`: `6`
- `get_note_commitment --op_id 1 --index 0`: `0c8293f676138583eb8b1cc70c239a0cd8b216c483e3847540b1769c5b8c353b`
- `get_note_commitment --op_id 2 --index 0`: `1867b41a55993c6214d81cddb753b1ffd7c916ff416af2f8ad2334b6d516f4eb`
- `get_note_commitment --op_id 3 --index 0`: `06f3507f3dfbf95de6199ebfbb59d4b8cdf4b7a34bec69fa0f6a21d1e29fdf99`
- `get_note_commitment --op_id 3 --index 1`: `2b474d1b1c84ca7ee8630450e5d75083dd09ad9abef893710b6c21ec28913476`
- `get_note_commitment --op_id 4 --index 0`: `06f3507f3dfbf95de6199ebfbb59d4b8cdf4b7a34bec69fa0f6a21d1e29fdf99`
- `get_note_commitment --op_id 4 --index 1`: `2b474d1b1c84ca7ee8630450e5d75083dd09ad9abef893710b6c21ec28913476`

## Frontend Integration Notes

- Use `deployments.clmm.testnet.json` as the source of truth for contract IDs.
- Testers can mint faucet balances from `DTA0` and `DTA1`; both expose permissionless `mint(to, amount)` for testnet only.
- Shielded operation calls must pass the concatenated Barretenberg proof bytes and public inputs expected by the CLMM methods.
- The CLMM verifier path is live: each shielded operation calls its operation-specific UltraHonk verifier contract.
- The Merkle tree authorization path is live: only the CLMM contract can insert leaves.
- Protocol fee claiming currently returns `[0,0]` because the shielded swap path does not yet accrue protocol fees.
- Non-blocking contract build warnings remain from duplicate generated spec types in `contracts/clmm/src/types.rs`.
