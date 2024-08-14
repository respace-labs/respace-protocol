import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture } from './deployFixture'
import { ZeroAddress } from 'ethers'
import { IndieX } from 'types'

interface BuyParams {
  creation: IndieX.CreationStructOutput
  amount: number
  account?: HardhatEthersSigner
  curator?: string
}

export async function buy(f: Fixture, params: BuyParams) {
  const { priceAfterFee: buyPriceAfterFee } = await f.indieX.getBuyPriceAfterFee(
    params.creation.id,
    params.amount,
    params.creation.appId,
  )

  const tx2 = await f.indieX
    .connect(params.account || f.user1)
    .buy(params.creation.id, params.amount, params.curator || ZeroAddress, { value: buyPriceAfterFee })
  await tx2.wait()
}
