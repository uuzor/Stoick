import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronDown,
  CircleCheck,
  Droplets,
  ExternalLink,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { ClmmClient, type PoolState } from "./lib/clmm-client";
import { TESTNET_DEPLOYMENT } from "./lib/deployments";
import type { WalletSigner } from "./lib/stellar";
import { Metric } from "./components/Metric";
import { PoolDepthChart } from "./components/PoolDepthChart";

const KNOWN_POOL_IDS = [1];

const TOKEN_REGISTRY = [
  {
    key: "asset0",
    symbol: "DTA0",
    name: "Dysentry Test Asset 0",
    address: TESTNET_DEPLOYMENT.contracts.faucetTokens.asset0,
  },
  {
    key: "asset1",
    symbol: "DTA1",
    name: "Dysentry Test Asset 1",
    address: TESTNET_DEPLOYMENT.contracts.faucetTokens.asset1,
  },
] as const;

const RECORDED_TXS = [
  ["Faucet wasm upload", "9cca6eee5d44fab9e9269fde1b5c5546a97799e8b0aecaf63328e515f05954b4", "Confirmed"],
  ["DTA0 faucet deploy", "89908532af6d9e5f89eb3f113cc423cd724a93ecd6ab17bc8c9416a7e07b5260", "Confirmed"],
  ["DTA1 faucet deploy", "4833cd3fb1c80305376cb7a1c0e515eb01306e117267131aa206afb640682a4c", "Confirmed"],
  ["State-bound CLMM upload", "915d2b3af7821b67f4d4241ba5f53b440575e80663de48ec681f9ab98b190986", "Confirmed"],
  ["Mint verifier deploy", "de2894966f311ba90b81b63f96b35fc6cd7541bc529c5c6738a300c51e45998f", "Confirmed"],
  ["Swap verifier deploy", "8de633d9caef0691350f65f41ed7c76b78bcf59784207dd9e7bdbe157573344d", "Confirmed"],
  ["Burn verifier deploy", "94c06682406a74cb9fd2df81e25ac27c5538fdf830cf28739cef0dd3a1bd25d9", "Confirmed"],
  ["Collect verifier deploy", "746b4e4a1ee3faf6d10fe61933cb654ab03c687ac6b6337af12025dd43234627", "Confirmed"],
  ["Final CLMM upload", "3aef2cc52a852368a0db3bc54c264f3a872b84c76762b0b93da83f3250b38088", "Confirmed"],
  ["Final CLMM deploy", "150ab7a616846cd0110a532c4a5f44f2a31d00a54d40a68bb0bd5a9a52747900", "Confirmed"],
  ["Authorize Merkle inserter", "9b017479b8cc697918dfa56a433caa2670d4c56b53701a274ff85c97489ef351", "Confirmed"],
  ["Create DTA0 / DTA1 pool", "649d926d4329eb4beca533815be3190313c4324f7f027082f162b477338dfb55", "Confirmed"],
  ["Escrow mint liquidity", "c37c780eab959dae1a6d0aba832bbbe03b815210d7cf922d76b91e26a15b4b8c", "Confirmed"],
  ["Escrow burn liquidity", "715f7079a61ca5ff2332a5ecf659462882a90f4a2017580d7b010cac06136037", "Confirmed"],
  ["Admin collect protocol fees", "ea801ad82bb96274816033d4c82cf5edba6adf29ad5f123d90785921f1f0287a", "Confirmed"],
];

interface PoolRecord {
  id: number;
  pool: PoolState;
  sequence: bigint;
}

interface AppData {
  pools: PoolRecord[];
  merkleLeafCount: bigint | null;
  commitments: string[][];
  balances: {
    asset0: bigint | null;
    asset1: bigint | null;
  };
}

interface AppContext {
  client: ClmmClient;
  wallet: WalletSigner | null;
  connecting: boolean;
  txPending: string | null;
  txHash: string | null;
  error: string | null;
  data: AppData;
  loading: boolean;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  createPool: (args: CreatePoolArgs) => Promise<void>;
  mintLiquidity: (args: MintLiquidityArgs) => Promise<void>;
  mintTesterTokens: (asset: "asset0" | "asset1") => Promise<void>;
}

interface CreatePoolArgs {
  asset0: string;
  asset1: string;
  fee: number;
  tickSpacing: number;
  initialSqrtPrice: bigint;
}

interface MintLiquidityArgs {
  poolId: number;
  tickLower: bigint;
  tickUpper: bigint;
  amount: bigint;
  minAmount0: bigint;
  minAmount1: bigint;
}

export function App() {
  const client = useMemo(() => new ClmmClient(), []);
  const [wallet, setWallet] = useState<WalletSigner | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [txPending, setTxPending] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AppData>({
    pools: [],
    merkleLeafCount: null,
    commitments: [],
    balances: { asset0: null, asset1: null },
  });

  const source = wallet?.publicKey ?? TESTNET_DEPLOYMENT.admin;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const poolResults = await Promise.all(
        KNOWN_POOL_IDS.map(async (id) => {
          const pool = await client.getPool(source, id);
          if (!pool) return null;
          const sequence = pool.sequence;
          return { id, pool, sequence };
        }),
      );

      const commitments = await loadCommitments(client, source);
      const merkleLeafCount = await client.getMerkleLeafCount(source).catch(() => null);
      const balances = wallet
        ? {
            asset0: await client.getFaucetBalance(source, "asset0", wallet.publicKey).catch(() => null),
            asset1: await client.getFaucetBalance(source, "asset1", wallet.publicKey).catch(() => null),
          }
        : { asset0: null, asset1: null };

      setData({
        pools: poolResults.filter((pool): pool is PoolRecord => pool !== null),
        merkleLeafCount,
        commitments,
        balances,
      });
    } catch (err) {
      setError(messageFromError(err, "Could not load on-chain CLMM data."));
    } finally {
      setLoading(false);
    }
  }, [client, source, wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { connectWalletWithModal } = await import("./lib/wallet");
      const signer = await connectWalletWithModal();
      setWallet(signer);
    } catch (err) {
      setError(messageFromError(err, "Wallet connection failed."));
    } finally {
      setConnecting(false);
    }
  }, []);

  const submit = useCallback(
    async (label: string, operation: ReturnType<ClmmClient["createPoolOp"]>) => {
      if (!wallet) {
        setError("Connect a Stellar testnet wallet before submitting transactions.");
        return;
      }
      setTxPending(label);
      setTxHash(null);
      setError(null);
      try {
        const result = await client.signAndSubmit(wallet, operation);
        setTxHash(result.hash);
        await refresh();
      } catch (err) {
        setError(messageFromError(err, `${label} transaction failed.`));
      } finally {
        setTxPending(null);
      }
    },
    [client, refresh, wallet],
  );

  const createPool = useCallback(
    async (args: CreatePoolArgs) => {
      if (!wallet) {
        setError("Connect a Stellar testnet wallet before creating a pool.");
        return;
      }
      const operation = client.createPoolOp({
        asset0: args.asset0,
        asset1: args.asset1,
        admin: wallet.publicKey,
        fee: args.fee,
        tickSpacing: args.tickSpacing,
        initialSqrtPrice: args.initialSqrtPrice,
      });
      await submit("Create pool", operation);
    },
    [client, submit, wallet],
  );

  const mintLiquidity = useCallback(
    async (args: MintLiquidityArgs) => {
      if (!wallet) {
        setError("Connect a Stellar testnet wallet before minting liquidity.");
        return;
      }
      const operation = client.mintPublicOp({
        poolId: args.poolId,
        owner: wallet.publicKey,
        tickLower: args.tickLower,
        tickUpper: args.tickUpper,
        amount: args.amount,
        minAmount0: args.minAmount0,
        minAmount1: args.minAmount1,
      });
      await submit("Mint liquidity", operation);
    },
    [client, submit, wallet],
  );

  const mintTesterTokens = useCallback(
    async (asset: "asset0" | "asset1") => {
      if (!wallet) {
        setError("Connect a Stellar testnet wallet before minting tester tokens.");
        return;
      }
      const operation = client.faucetMintOp({
        asset,
        to: wallet.publicKey,
        amount: 10_000_000_000n,
      });
      await submit(`Mint ${asset === "asset0" ? "DTA0" : "DTA1"}`, operation);
    },
    [client, submit, wallet],
  );

  const context: AppContext = {
    client,
    wallet,
    connecting,
    txPending,
    txHash,
    error,
    data,
    loading,
    connect,
    refresh,
    createPool,
    mintLiquidity,
    mintTesterTokens,
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="workspace">
        <Topbar context={context} />
        <main className="content">
          <StatusStrip context={context} />
          <Routes>
            <Route index element={<DashboardPage context={context} />} />
            <Route path="explore/deposit" element={<PoolsPage context={context} />} />
            <Route path="explore/pools" element={<PoolsPage context={context} />} />
            <Route path="explore/token/:symbol" element={<PoolDetailPage context={context} />} />
            <Route path="liquidity" element={<LiquidityPage context={context} />} />
            <Route path="swap" element={<SwapPage context={context} />} />
            <Route path="activity" element={<ActivityPage context={context} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <Link className="brand-lockup" to="/">
        <span>D</span>
        <strong>Dysentry</strong>
      </Link>
      <nav className="side-nav" aria-label="Dysentry navigation">
        <NavLink to="/">
          <BarChart3 size={17} /> Dashboard
        </NavLink>
        <NavLink to="/explore/deposit">
          <Droplets size={17} /> Pools
        </NavLink>
        <NavLink to="/liquidity">
          <Layers3 size={17} /> Liquidity
        </NavLink>
        <NavLink to="/swap">
          <ArrowRight size={17} /> Swap
        </NavLink>
        <NavLink to="/activity">
          <Activity size={17} /> Activity
        </NavLink>
      </nav>
      <div className="sidebar-status">
        <span>Testnet CLMM</span>
        <strong>{shortId(TESTNET_DEPLOYMENT.contracts.clmm)}</strong>
      </div>
    </aside>
  );
}

function Topbar({ context }: { context: AppContext }) {
  return (
    <header className="topbar">
      <div className="search-box">
        <Search size={16} />
        <input placeholder="Search pools, pool ids, commitments" />
      </div>
      <div className="topbar-actions">
        <button type="button" className="network-button">
          Stellar Testnet <ChevronDown size={14} />
        </button>
        <button type="button" className="connect-button" onClick={context.connect} disabled={context.connecting}>
          <Wallet size={16} /> {context.wallet ? shortId(context.wallet.publicKey) : context.connecting ? "Connecting" : "Connect wallet"}
        </button>
      </div>
    </header>
  );
}

function StatusStrip({ context }: { context: AppContext }) {
  if (!context.error && !context.txPending && !context.txHash) return null;
  return (
    <div className="status-strip">
      {context.txPending ? <span>{context.txPending} pending...</span> : null}
      {context.txHash ? <span>Last transaction: {shortHash(context.txHash)}</span> : null}
      {context.error ? <strong>{context.error}</strong> : null}
    </div>
  );
}

function DashboardPage({ context }: { context: AppContext }) {
  const firstPool = context.data.pools[0];

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Overview"
        copy="Track live CLMM pool state, proof health, and commitment records from the deployed Stellar testnet contracts."
        action="Refresh"
        onAction={context.refresh}
      />

      <section className="stats-grid">
        <Metric label="Known pools loaded" value={context.loading ? "Loading" : String(context.data.pools.length)} />
        <Metric label="Available assets" value={context.loading ? "Loading" : String(assetAddresses(context.data.pools).length)} />
        <Metric label="Pool sequence" value={firstPool ? firstPool.sequence.toString() : unavailable(context.loading)} />
        <Metric label="Merkle leaves" value={context.data.merkleLeafCount?.toString() ?? unavailable(context.loading)} />
      </section>

      <section className="dashboard-grid">
        <Panel title="Your private positions" action="Import">
          <EmptyState title="No local positions" copy="Position discovery is not available from public contract state. Connect a wallet and import note data to populate this table." />
        </Panel>
        <Panel title="Tester faucet">
          <FaucetPanel context={context} />
        </Panel>
      </section>

      <Panel title="Live pools" action="Explore all">
        <PoolTable context={context} />
      </Panel>
      <Panel title="Protocol health" action="Inspect">
        <div className="health-list">
          {["Mint verifier", "Swap verifier", "Collect verifier", "Burn verifier", "Merkle inserter"].map((item) => (
            <div className="health-row" key={item}>
              <CircleCheck size={16} />
              <span>{item}</span>
              <strong>Live</strong>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function PoolsPage({ context }: { context: AppContext }) {
  return (
    <>
      <PageHeader
        eyebrow="Explore"
        title="Pools"
        copy="Create pools and inspect on-chain CLMM state. The current contract exposes known pool reads, not a global pool index."
        action="Refresh"
        onAction={context.refresh}
      />
      <MarketToolbar loading={context.loading} />
      <section className="dashboard-grid">
        <Panel title="Available pools" action="Reload">
          <PoolTable context={context} />
        </Panel>
        <Panel title="Available assets">
          <AssetTable context={context} />
        </Panel>
      </section>
      <section className="dashboard-grid">
        <Panel title="Create pool">
          <CreatePoolForm context={context} />
        </Panel>
        <Panel title="Contract scope">
          <div className="route-list">
            <InfoRow label="Pools" value={context.loading ? "Loading" : String(context.data.pools.length)} />
            <InfoRow label="Assets" value={context.loading ? "Loading" : String(assetAddresses(context.data.pools).length)} />
            <InfoRow label="Asset model" value="Token addresses" />
            <InfoRow label="Indexer" value="Not available" />
          </div>
        </Panel>
      </section>
    </>
  );
}

function PoolDetailPage({ context }: { context: AppContext }) {
  const { symbol = "1" } = useParams();
  const pool = context.data.pools.find((item) => String(item.id) === symbol) ?? context.data.pools[0];

  return (
    <>
      <section className="token-header">
        <div>
          <p className="eyebrow">Pool detail</p>
          <h1>{pool ? poolName(pool) : context.loading ? "Loading pool" : "Pool unavailable"}</h1>
          <p>{pool ? `Pool ID ${pool.id}. Fee ${formatBps(pool.pool.fee)}. Tick spacing ${pool.pool.tick_spacing}.` : "No on-chain pool record was returned."}</p>
        </div>
        <div className="token-actions">
          <Link className="primary-button" to="/liquidity">
            Deposit
          </Link>
          <Link className="ghost-button" to="/swap">
            Swap
          </Link>
        </div>
      </section>

      <section className="stats-grid">
        <Metric label="Liquidity" value={pool ? formatBig(pool.pool.liquidity) : unavailable(context.loading)} />
        <Metric label="Sqrt price" value={pool ? formatBig(pool.pool.sqrt_price) : unavailable(context.loading)} />
        <Metric label="Current tick" value={pool ? pool.pool.current_tick.toString() : unavailable(context.loading)} />
        <Metric label="Sequence" value={pool ? pool.sequence.toString() : unavailable(context.loading)} />
      </section>

      <section className="token-grid">
        <Panel title="Pool depth">
          <PoolDepthChart />
        </Panel>
        <Panel title="Private deposit">
          <MintLiquidityForm context={context} defaultPoolId={pool?.id ?? 1} />
        </Panel>
      </section>

      <Panel title="Proof requirements" action="Artifacts">
        <DataTable
          columns={["Action", "Public inputs", "Proof bytes", "Verifier"]}
          rows={[
            ["Mint", "7 fields / 224 B", "14,592", "Live"],
            ["Swap", "5 fields / 160 B", "14,592", "Live"],
            ["Collect", "6 fields / 192 B", "14,592", "Live"],
            ["Burn", "8 fields / 256 B", "14,592", "Live"],
          ]}
        />
      </Panel>
    </>
  );
}

function LiquidityPage({ context }: { context: AppContext }) {
  return (
    <>
      <PageHeader
        eyebrow="Liquidity"
        title="Positions"
        copy="Mint liquidity into CLMM pools with wallet-signed Soroban transactions. Private note discovery will be added on top of imported shielded state."
        action="Refresh"
        onAction={context.refresh}
      />
      <section className="liquidity-grid">
        <Panel title="Mint liquidity">
          <MintLiquidityForm context={context} defaultPoolId={context.data.pools[0]?.id ?? 1} />
        </Panel>
        <Panel title="Tester faucet">
          <FaucetPanel context={context} />
        </Panel>
      </section>
      <Panel title="Range preview">
        <PoolDepthChart />
      </Panel>
      <Panel title="Open positions">
        <EmptyState title="No local position notes" copy="The CLMM contract stores commitments, not a public position list for private liquidity. Import notes to view owned private positions." />
      </Panel>
    </>
  );
}

function SwapPage({ context }: { context: AppContext }) {
  const pool = context.data.pools[0];
  const [amount, setAmount] = useState("100");
  const [direction, setDirection] = useState<"0to1" | "1to0">("0to1");
  const quote = pool ? calculateSwapQuote(pool, amount, direction) : null;
  const toAsset = pool ? tokenSymbol(direction === "0to1" ? pool.pool.asset_1 : pool.pool.asset_0) : "Asset";
  const fromAsset = pool ? tokenSymbol(direction === "0to1" ? pool.pool.asset_0 : pool.pool.asset_1) : "Asset";

  return (
    <>
      <PageHeader
        eyebrow="Swap"
        title="Shielded swap"
        copy="Get an indicative quote without connecting a wallet. Submission still requires a fresh proof and wallet-signed transaction."
      />
      <section className="swap-layout">
        <Panel title="Swap">
          <div className="swap-box">
            <TokenInput label="From" asset={fromAsset} amount={amount} onAmountChange={setAmount} />
            <button
              className="switch-button"
              type="button"
              onClick={() => setDirection((current) => (current === "0to1" ? "1to0" : "0to1"))}
            >
              <ArrowRight size={16} />
            </button>
            <TokenInput label="To" asset={toAsset} amount={quote?.output ?? ""} readOnly />
            <button className="primary-button full" type="button" disabled>
              Fresh proof required
            </button>
          </div>
        </Panel>
        <Panel title="Quote and fees">
          <div className="route-list">
            <InfoRow label="Pool" value={pool ? poolName(pool) : unavailable(context.loading)} />
            <InfoRow label="Price" value={quote?.price ?? unavailable(context.loading)} />
            <InfoRow label="Pool fee" value={quote?.poolFee ?? unavailable(context.loading)} />
            <InfoRow label="Protocol fee" value={quote?.protocolFee ?? "0"} />
            <InfoRow label="Estimated output" value={quote?.output ?? unavailable(context.loading)} />
            <InfoRow label="Public inputs" value="5 fields / 160 B" />
            {pool && pool.pool.liquidity === 0n ? (
              <div className="quote-warning">Pool liquidity is currently zero. This quote is indicative and uses the pool price plus fee schedule.</div>
            ) : null}
          </div>
        </Panel>
      </section>
    </>
  );
}

function ActivityPage({ context }: { context: AppContext }) {
  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Proof and transaction history"
        copy="Live commitment reads plus the latest recorded testnet deployment flow."
        action="Refresh"
        onAction={context.refresh}
      />
      <Panel title="Recorded testnet transactions" action="Explorer">
        <DataTable columns={["Action", "Transaction", "Status"]} rows={RECORDED_TXS.map(([a, tx, s]) => [a, shortHash(tx), s])} />
      </Panel>
      <Panel title="Commitments">
        {context.loading ? (
          <LoadingState label="Loading commitments" />
        ) : context.data.commitments.length ? (
          <DataTable columns={["Operation", "Commitment", "Index", "Source"]} rows={context.data.commitments} />
        ) : (
          <EmptyState title="No commitments loaded" copy="The known operation commitment reads returned empty." />
        )}
      </Panel>
    </>
  );
}

function PageHeader({
  eyebrow,
  title,
  copy,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: string;
  onAction?: () => void | Promise<void>;
}) {
  return (
    <section className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action ? (
        <button className="primary-button" type="button" onClick={() => void onAction?.()}>
          <Plus size={15} /> {action}
        </button>
      ) : null}
    </section>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {action ? (
          <button className="panel-action" type="button">
            {action} <ExternalLink size={13} />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MarketToolbar({ loading }: { loading: boolean }) {
  return (
    <div className="market-toolbar">
      <button className="filter active" type="button">
        Known pools
      </button>
      <button className="filter" type="button" disabled>
        {loading ? "Loading chain state" : "No indexed pool list"}
      </button>
    </div>
  );
}

function PoolTable({ context }: { context: AppContext }) {
  if (context.loading) return <LoadingState label="Loading pools" />;
  if (!context.data.pools.length) {
    return <EmptyState title="No pools loaded" copy="Create a pool or add the pool ID to the known pool list." />;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pool</th>
            <th>Fee</th>
            <th>Liquidity</th>
            <th>Sqrt price</th>
            <th>Tick spacing</th>
            <th>Sequence</th>
            <th>Proofs</th>
          </tr>
        </thead>
        <tbody>
          {context.data.pools.map((record) => (
            <tr key={record.id}>
              <td>
                <Link className="asset-cell" to={`/explore/token/${record.id}`}>
                  <span>{poolName(record)}</span>
                  <small>Pool ID {record.id}</small>
                </Link>
              </td>
              <td>{formatBps(record.pool.fee)}</td>
              <td>{formatBig(record.pool.liquidity)}</td>
              <td>{formatBig(record.pool.sqrt_price)}</td>
              <td>{record.pool.tick_spacing}</td>
              <td>{record.sequence.toString()}</td>
              <td>
                <span className="status-live">Live</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetTable({ context }: { context: AppContext }) {
  if (context.loading) return <LoadingState label="Loading assets" />;
  const ids = assetAddresses(context.data.pools);
  if (!ids.length) return <EmptyState title="No assets loaded" copy="No pool token addresses were returned from the known pool reads." />;
  return (
    <DataTable
      columns={["Asset", "Contract", "Pools"]}
      rows={ids.map((address) => [tokenSymbol(address), shortId(address), String(context.data.pools.filter((record) => record.pool.asset_0 === address || record.pool.asset_1 === address).length)])}
    />
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((cell, index) => (
                <td key={`${cell}-${index}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FaucetPanel({ context }: { context: AppContext }) {
  const disabled = !context.wallet || Boolean(context.txPending);
  return (
    <div className="faucet-panel">
      <div className="faucet-row">
        <div>
          <strong>DTA0</strong>
          <span>{formatTokenBalance(context.data.balances.asset0)}</span>
        </div>
        <button className="primary-button" type="button" disabled={disabled} onClick={() => void context.mintTesterTokens("asset0")}>
          {context.txPending === "Mint DTA0" ? "Minting" : "Mint 1,000"}
        </button>
      </div>
      <div className="faucet-row">
        <div>
          <strong>DTA1</strong>
          <span>{formatTokenBalance(context.data.balances.asset1)}</span>
        </div>
        <button className="primary-button" type="button" disabled={disabled} onClick={() => void context.mintTesterTokens("asset1")}>
          {context.txPending === "Mint DTA1" ? "Minting" : "Mint 1,000"}
        </button>
      </div>
      {!context.wallet ? <p>Connect a Stellar testnet wallet to mint tester balances.</p> : null}
    </div>
  );
}

function CreatePoolForm({ context }: { context: AppContext }) {
  const [asset0, setAsset0] = useState<string>(TOKEN_REGISTRY[0].address);
  const [asset1, setAsset1] = useState<string>(TOKEN_REGISTRY[1].address);
  const [fee, setFee] = useState("30");
  const [tickSpacing, setTickSpacing] = useState("100");
  const [initialSqrtPrice, setInitialSqrtPrice] = useState("79228162512");

  return (
    <form
      className="deposit-box"
      onSubmit={(event) => {
        event.preventDefault();
        void context.createPool({
          asset0,
          asset1,
          fee: Number(fee),
          tickSpacing: Number(tickSpacing),
          initialSqrtPrice: BigInt(initialSqrtPrice),
        });
      }}
    >
      <label>
        Token 0
        <select value={asset0} onChange={(event) => setAsset0(event.target.value)}>
          {TOKEN_REGISTRY.map((token) => (
            <option key={token.address} value={token.address}>
              {token.symbol} - {shortId(token.address)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Token 1
        <select value={asset1} onChange={(event) => setAsset1(event.target.value)}>
          {TOKEN_REGISTRY.map((token) => (
            <option key={token.address} value={token.address}>
              {token.symbol} - {shortId(token.address)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fee bps
        <input value={fee} onChange={(event) => setFee(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Tick spacing
        <input value={tickSpacing} onChange={(event) => setTickSpacing(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Initial sqrt price
        <input value={initialSqrtPrice} onChange={(event) => setInitialSqrtPrice(event.target.value)} inputMode="numeric" />
      </label>
      <div className="privacy-note">
        <ShieldCheck size={16} />
        <span>The current CLMM constructor accepts any authenticated creator as pool admin for this transaction.</span>
      </div>
      <button className="primary-button full" type="submit" disabled={!context.wallet || Boolean(context.txPending)}>
        {context.txPending === "Create pool" ? "Creating..." : "Create pool"}
      </button>
    </form>
  );
}

function MintLiquidityForm({ context, defaultPoolId }: { context: AppContext; defaultPoolId: number }) {
  const [poolId, setPoolId] = useState(String(defaultPoolId));
  const [tickLower, setTickLower] = useState("-1200");
  const [tickUpper, setTickUpper] = useState("1200");
  const [amount, setAmount] = useState("1000000000");
  const [minAmount0, setMinAmount0] = useState("100000000");
  const [minAmount1, setMinAmount1] = useState("100000000");

  useEffect(() => {
    setPoolId(String(defaultPoolId));
  }, [defaultPoolId]);

  return (
    <form
      className="deposit-box"
      onSubmit={(event) => {
        event.preventDefault();
        void context.mintLiquidity({
          poolId: Number(poolId),
          tickLower: BigInt(tickLower),
          tickUpper: BigInt(tickUpper),
          amount: BigInt(amount),
          minAmount0: BigInt(minAmount0),
          minAmount1: BigInt(minAmount1),
        });
      }}
    >
      <InfoRow label="Wallet" value={context.wallet ? shortId(context.wallet.publicKey) : "Not connected"} />
      <label>
        Pool ID
        <input value={poolId} onChange={(event) => setPoolId(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Lower tick
        <input value={tickLower} onChange={(event) => setTickLower(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Upper tick
        <input value={tickUpper} onChange={(event) => setTickUpper(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Liquidity amount
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Min amount 0
        <input value={minAmount0} onChange={(event) => setMinAmount0(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Min amount 1
        <input value={minAmount1} onChange={(event) => setMinAmount1(event.target.value)} inputMode="numeric" />
      </label>
      <div className="privacy-note">
        <ShieldCheck size={16} />
        <span>This submits `mint_public`. Fresh private mint proofs still require new witness generation to avoid spent nullifiers.</span>
      </div>
      <button className="primary-button full" type="submit" disabled={!context.wallet || Boolean(context.txPending)}>
        {context.txPending === "Mint liquidity" ? "Minting..." : "Mint liquidity"}
      </button>
    </form>
  );
}

function TokenInput({
  label,
  asset,
  amount,
  onAmountChange,
  readOnly = false,
}: {
  label: string;
  asset: string;
  amount: string;
  onAmountChange?: (amount: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="token-input">
      <span>{label}</span>
      <div>
        <input
          value={amount}
          onChange={(event) => onAmountChange?.(event.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          readOnly={readOnly}
        />
        <button type="button">{asset}</button>
      </div>
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="loading-state">
      <span />
      {label}
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

async function loadCommitments(client: ClmmClient, source: string): Promise<string[][]> {
  const reads = [
    ["Mint", 1, 0],
    ["Swap", 2, 0],
    ["Collect", 3, 0],
    ["Collect", 3, 1],
    ["Burn", 4, 0],
    ["Burn", 4, 1],
  ] as const;
  const rows = await Promise.all(
    reads.map(async ([label, opId, index]) => {
      const commitment = await client.getNoteCommitment(source, opId, index).catch(() => null);
      return commitment ? [label, shortHash(bytesToHex(commitment)), String(index), "On-chain"] : null;
    }),
  );
  return rows.filter((row): row is string[] => row !== null);
}

function poolName(record: PoolRecord): string {
  return `${tokenSymbol(record.pool.asset_0)} / ${tokenSymbol(record.pool.asset_1)}`;
}

function formatBps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function assetAddresses(pools: PoolRecord[]): string[] {
  return Array.from(new Set(pools.flatMap((record) => [record.pool.asset_0, record.pool.asset_1]))).sort();
}

function tokenSymbol(address: string): string {
  return TOKEN_REGISTRY.find((token) => token.address === address)?.symbol ?? shortId(address);
}

function formatBig(value: bigint | number): string {
  return value.toString();
}

function formatTokenBalance(value: bigint | null): string {
  if (value === null) return "Not loaded";
  return `${Number(value) / 10_000_000} available`;
}

function calculateSwapQuote(record: PoolRecord, amountInput: string, direction: "0to1" | "1to0") {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      price: "0",
      poolFee: "0",
      protocolFee: "0",
      output: "0",
    };
  }

  const sqrtPrice = Number(record.pool.sqrt_price);
  const q96 = 2 ** 96;
  const price01 = (sqrtPrice * sqrtPrice) / q96;
  const price = direction === "0to1" ? price01 : 1 / price01;
  const feeRate = record.pool.fee / 10_000;
  const poolFee = amount * feeRate;
  const amountAfterFee = amount - poolFee;
  const output = amountAfterFee * price;

  return {
    price: formatDecimal(price),
    poolFee: `${formatDecimal(poolFee)} ${tokenSymbol(direction === "0to1" ? record.pool.asset_0 : record.pool.asset_1)}`,
    protocolFee: "0",
    output: formatDecimal(output),
  };
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 1 ? 8 : 4,
  }).format(value);
}

function unavailable(loading: boolean): string {
  return loading ? "Loading" : "Unavailable";
}

function shortId(value: string) {
  return `${value.slice(0, 7)}...${value.slice(-6)}`;
}

function shortHash(value: string) {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  return `${clean.slice(0, 8)}...${clean.slice(-6)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
