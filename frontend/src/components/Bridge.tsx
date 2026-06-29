import { useState } from 'react'
import { useWraith } from '../hooks/useWraith'
import { useSubmit } from '../hooks/useSubmit'
import { ASSET_OPTIONS } from '../lib/assets'
import { isPositiveAmount, isValidStellarAddress } from '../lib/format'
import type { AssetCode } from '../lib/wraith-sdk'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  Card,
  Field,
  PageIntro,
  SectionHeading,
  Select,
  TextInput,
  TxBanner,
} from './ui'

export function Bridge() {
  const { sdk, refreshBalances } = useWraith()

  const [depositAsset, setDepositAsset] = useState<AssetCode>('XLM')
  const [depositAmount, setDepositAmount] = useState('')
  const deposit = useSubmit()

  const [withdrawAsset, setWithdrawAsset] = useState<AssetCode>('XLM')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const withdraw = useSubmit()

  const depositValid = isPositiveAmount(depositAmount)
  const recipientValid = isValidStellarAddress(recipient)
  const withdrawValid = isPositiveAmount(withdrawAmount) && recipientValid

  async function onDeposit() {
    const result = await deposit.submit(() => sdk.deposit({ asset: depositAsset, amount: depositAmount }))
    if (result) {
      setDepositAmount('')
      await refreshBalances()
    }
  }

  async function onWithdraw() {
    const result = await withdraw.submit(() =>
      sdk.withdraw({ asset: withdrawAsset, amount: withdrawAmount, recipient: recipient.trim() }),
    )
    if (result) {
      setWithdrawAmount('')
      setRecipient('')
      await refreshBalances()
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Bridge" subtitle="Move classic Stellar assets in and out of the shielded layer." />

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-6">
          <SectionHeading icon={<ArrowDownIcon className="h-4 w-4" />} title="Deposit" hint="Classic → Wraith" />
          <p className="mb-5 mt-1 text-sm text-zinc-500">
            Public on-chain. Funds become a private shielded note.
          </p>
          <div className="space-y-4">
            <Field label="Asset">
              <Select
                value={depositAsset}
                onChange={(e) => setDepositAsset(e.target.value as AssetCode)}
                options={ASSET_OPTIONS}
              />
            </Field>
            <Field label="Amount">
              <TextInput
                mono
                inputMode="decimal"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </Field>
            <Button
              className="w-full"
              loading={deposit.state.status === 'pending'}
              disabled={!depositValid}
              onClick={() => void onDeposit()}
            >
              Deposit
            </Button>
            <TxBanner
              status={deposit.state.status}
              hash={deposit.state.hash}
              error={deposit.state.error}
              successLabel="Deposit submitted"
            />
          </div>
        </Card>

        <Card className="p-6">
          <SectionHeading icon={<ArrowUpIcon className="h-4 w-4" />} title="Withdraw" hint="Wraith → Classic" />
          <p className="mb-5 mt-1 text-sm text-zinc-500">
            ZK-proven. Sends shielded funds to a classic Stellar account.
          </p>
          <div className="space-y-4">
            <Field label="Asset">
              <Select
                value={withdrawAsset}
                onChange={(e) => setWithdrawAsset(e.target.value as AssetCode)}
                options={ASSET_OPTIONS}
              />
            </Field>
            <Field label="Amount">
              <TextInput
                mono
                inputMode="decimal"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
            </Field>
            <Field
              label="Recipient (Stellar address)"
              hint={
                recipient && !recipientValid ? (
                  <span className="text-amber-400">Enter a valid G… address.</span>
                ) : (
                  'Public account that receives the funds.'
                )
              }
            >
              <TextInput
                mono
                placeholder="G…"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </Field>
            <Button
              className="w-full"
              loading={withdraw.state.status === 'pending'}
              disabled={!withdrawValid}
              onClick={() => void onWithdraw()}
            >
              Withdraw
            </Button>
            <TxBanner
              status={withdraw.state.status}
              hash={withdraw.state.hash}
              error={withdraw.state.error}
              successLabel="Withdrawal submitted"
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
