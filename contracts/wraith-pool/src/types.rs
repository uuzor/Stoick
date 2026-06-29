use soroban_sdk::{contracterror, contractevent, contracttype, Address, BytesN, Vec};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    TransferVf,
    OrderVf,
    MatchVf,
    WithdrawVf,
    CancelVf,
    /// The native-XLM SAC address. Its canonical `asset_id` is `0` (SHARED §4),
    /// so `withdraw` recognises it specially when binding `asset` to the proof.
    NativeAsset,
    NextIndex,
    Roots,
    Frontier(u32),
    Nullifier(BytesN<32>),
    Order(BytesN<32>),
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum WraithError {
    VerifierNotSet = 1,
    VerificationFailed = 2,
    InvalidPublicInputs = 3,
    UnknownRoot = 4,
    NullifierUsed = 5,
    DuplicateNullifier = 6,
    OrderNotActive = 7,
    DuplicateOrder = 8,
    TreeFull = 9,
    InvalidAmount = 10,
    AmountMismatch = 11,
    /// The SAC `asset` Address does not derive the proof's public `asset_id`.
    AssetMismatch = 12,
    /// The `recipient` Address does not derive the proof's public `recipient_hash`.
    RecipientMismatch = 13,
}

#[contractevent(topics = ["deposit"], data_format = "map")]
pub struct DepositEvent {
    #[topic]
    pub index: u32,
    pub commitment: BytesN<32>,
    pub asset: Address,
    pub amount: i128,
}

#[contractevent(topics = ["withdraw"], data_format = "map")]
pub struct WithdrawEvent {
    #[topic]
    pub nullifier: BytesN<32>,
    pub recipient: Address,
    pub asset: Address,
    pub amount: i128,
}

#[contractevent(topics = ["transfer"], data_format = "map")]
pub struct TransferEvent {
    pub nullifiers: Vec<BytesN<32>>,
    pub commitments: Vec<BytesN<32>>,
}

#[contractevent(topics = ["order_placed"], data_format = "map")]
pub struct OrderPlacedEvent {
    #[topic]
    pub order_commitment: BytesN<32>,
    pub change_commitment: BytesN<32>,
}

#[contractevent(topics = ["order_matched"], data_format = "map")]
pub struct OrderMatchedEvent {
    #[topic]
    pub order_a: BytesN<32>,
    #[topic]
    pub order_b: BytesN<32>,
    pub fill_buyer: BytesN<32>,
    pub fill_seller: BytesN<32>,
}

#[contractevent(topics = ["order_cancelled"], data_format = "map")]
pub struct OrderCancelledEvent {
    #[topic]
    pub order_commitment: BytesN<32>,
    pub refund: BytesN<32>,
}
