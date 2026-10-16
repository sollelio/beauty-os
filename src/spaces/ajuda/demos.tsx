// Ajuda · educational microanimations (learning experience L3; Help Center V6 as corrected in L0). Three short
// demonstrations, true to the implementation:
// - Misto: offered only when the salon has exactly two active payment methods; the two values must add up before
//   «Confirmar serviço» is enabled — the sentences are the app's own (checkPayment), in the device's currency.
// - Stock: the product sheet, a state, then «Guardar» (online only); marking «Comprar» records no purchase.
// - Sem ligação: services wait on the phone and are sent while Beauty OS is open and connected — or end «Para rever»;
//   advances, expenses and purchases wait for an online PIN confirmation. Nothing is presented as guaranteed.
// Synthetic data only: example amounts, product and method names; the currency is the organization's setting, read
// from the device context already in memory. No server, no device storage.
import { useContext, type CSSProperties, type JSX } from 'react'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { formatAmount, formatMoney, type CurrencySettings } from '../../shared/money'
import { checkPayment } from '../../shared/payment'
import { Icon } from '../../shared/ui/Icon'
import { Microanimation, StillExplanation, type MicroFrame } from '../../shared/ui/Microanimation'
import { StatusChip } from '../../shared/ui/StatusChip'
import type { HelpAnimation } from './topics'
import './microanimations.css'

/** A stage step's delay, read by the stage CSS as `animation-delay: var(--d)`. */
const delay = (ms: number): CSSProperties => ({ ['--d' as string]: `${ms}ms` })

/** The Misto example in whole units: a total, a first part, a second part that is first too short, then corrected. */
type MistoExample = { total: number; first: number; short: number; second: number }

/** Synthetic amounts that read naturally in each supported currency (organization setting `currency_code`). A choice
 *  per currency — never a conversion. A currency without its own example gets a still explanation without amounts
 *  (MISTO_STILL) until one is decided for it. */
const MISTO_EXAMPLES: Record<string, MistoExample> = {
  AOA: { total: 3500, first: 2000, short: 1000, second: 1500 },
  EUR: { total: 35, first: 20, short: 10, second: 15 },
}

/** Misto without amounts: the same rules, for a currency that has no example yet. */
const MISTO_STILL: MicroFrame[] = [
  { title: 'Toque em «Misto».', text: 'Divide o valor do serviço entre duas formas de pagamento. Só aparece quando o salão usa exatamente duas formas de pagamento.' },
  { title: 'Indique os dois valores.', text: 'Enquanto a soma não for igual ao valor do serviço, a app indica quanto falta ou quanto excede, e «Confirmar serviço» continua desativado.' },
  { title: 'A soma tem de bater certo.', text: 'Quando os dois valores somam exatamente o valor do serviço, a app diz «Pronto para confirmar». Só então «Confirmar serviço» fica ativo.' },
]

/** Synthetic whole-unit amounts in the organization's currency (the help is under DeviceGate, so it is known),
 *  formatted and checked by the app's own money and payment functions. */
function useExampleMoney() {
  const org = useContext(OrganizationContext)
  const c: CurrencySettings = org ? { currency_exponent: org.currency_exponent, currency_symbol: org.currency_symbol } : { currency_exponent: 0, currency_symbol: '' }
  const minor = (units: number) => units * 10 ** c.currency_exponent
  return {
    example: org ? MISTO_EXAMPLES[org.currency_code] : undefined,
    money: (units: number) => (c.currency_symbol ? formatMoney(minor(units), c) : formatAmount(minor(units), c)),
    amount: (units: number) => formatAmount(minor(units), c),
    symbol: c.currency_symbol,
    /** The sentence the app shows under the two Misto fields (shared/payment.ts). */
    sentence: (total: number, a: number, b: number) => checkPayment(minor(total), 'mixed', [minor(a), minor(b)], c).sentence ?? '',
  }
}

function MistoDemo() {
  const { example, money, amount, symbol, sentence } = useExampleMoney()
  if (!example) return <StillExplanation title="Misto: dividir o valor" frames={MISTO_STILL} />
  const { total: TOTAL, first: FIRST, short: SHORT, second: SECOND } = example
  const short = sentence(TOTAL, FIRST, SHORT), ready = sentence(TOTAL, FIRST, SECOND)
  const frames: MicroFrame[] = [
    { title: 'Toque em «Misto».', text: 'Divide o valor do serviço entre duas formas de pagamento. Só aparece quando o salão usa exatamente duas formas de pagamento.' },
    { title: 'Indique os dois valores.', text: `Exemplo: ${money(FIRST)} numa forma e ${money(SHORT)} na outra. A app diz: ${short} «Confirmar serviço» continua desativado.` },
    { title: 'A soma tem de bater certo.', text: `Com ${money(SECOND)} na segunda forma, a app diz: ${ready} Só então «Confirmar serviço» fica ativo.` },
  ]
  return (
    <Microanimation title="Misto: dividir o valor" durationMs={3600} frames={frames}>
      <div className="ma-box"><span>Valor</span><b>{money(TOTAL)}</b></div>
      <div className="ma-box">Numerário</div>
      <div className="ma-box">Transferência</div>
      <div className="ma-box">Misto<span className="ma-pick" style={delay(900)} /><span className="ma-finger ma-tap" style={delay(300)} /></div>
      <div className="ma-box ma-in" style={delay(1150)}><span>Numerário</span><b className="ma-in" style={delay(1700)}>{amount(FIRST)} {symbol}</b></div>
      <div className="ma-box ma-in" style={delay(1300)}>
        <span>Transferência</span>
        <span className="ma-stack">
          <span className="ma-out" style={delay(3000)}><b className="ma-in" style={delay(2200)}>{amount(SHORT)} {symbol}</b></span>
          <b className="ma-in" style={delay(3050)}>{amount(SECOND)} {symbol}</b>
        </span>
      </div>
      <div className="ma-stack">
        <span className="ma-out" style={delay(3000)}><p className="ma-caption ma-in" style={delay(2300)}>{short}</p></span>
        <p className="ma-caption ma-in" style={delay(3100)}>{ready}</p>
      </div>
      <div className="ma-stack">
        <span className="ma-btn ma-btn-off">Confirmar serviço</span>
        <span className="ma-btn ma-btn-on ma-in" style={delay(3300)}>Confirmar serviço</span>
      </div>
    </Microanimation>
  )
}

function StockDemo() {
  const frames: MicroFrame[] = [
    { title: 'Toque no produto.', text: 'Abre-se a folha do produto, com o estado que está marcado.' },
    { title: 'Escolha o estado e toque em «Guardar».', text: 'OK, Baixo ou Comprar. Guardar precisa de ligação: sem ligação, não é possível guardar.' },
    { title: 'Fica marcado.', text: 'Marcar «Comprar» junta o produto à lista de «Preparar compra». Não regista nenhuma compra: a compra regista-se depois, em «Registar compra».' },
  ]
  return (
    <Microanimation title="Marcar o estado de um produto" durationMs={3600} frames={frames}>
      <div className="ma-box">
        <span><b>Champô</b><span className="ma-sub">quase vazio</span></span>
        <span className="ma-stack">
          <span className="ma-out" style={delay(2950)}><StatusChip tone="success">OK</StatusChip></span>
          <span className="ma-in" style={delay(2950)}><StatusChip tone="warning">Comprar</StatusChip></span>
        </span>
        <span className="ma-finger ma-tap" style={delay(300)} />
      </div>
      {/* the sheet, then — in its place once it closes — the list and the reminder that no purchase was recorded */}
      <div className="ma-stack">
        <div className="ma-out" style={delay(2800)}>
          <div className="ma-sheet ma-in" style={delay(1100)}>
            <span className="label">Estado</span>
            <div className="ma-row">
              <span className="ma-box">OK<span className="ma-ring ma-out" style={delay(1950)} /></span>
              <span className="ma-box">Baixo</span>
              <span className="ma-box">Comprar<span className="ma-pick" style={delay(1950)} /><span className="ma-finger ma-tap" style={delay(1400)} /></span>
            </div>
            <span className="ma-btn ma-btn-on">Guardar<span className="ma-finger ma-tap" style={delay(2150)} /></span>
            <p className="ma-caption">Guardar precisa de ligação.</p>
          </div>
        </div>
        <div className="ma-final ma-in" style={delay(3250)}>
          <span className="ma-btn ma-btn-on">Preparar compra · 1 produto</span>
          <p className="ma-caption">Nenhuma compra fica registada: regista-se depois, em «Registar compra».</p>
        </div>
      </div>
    </Microanimation>
  )
}

function OfflineDemo() {
  const frames: MicroFrame[] = [
    { title: 'Sem ligação.', text: 'O serviço fica «Guardado neste telemóvel» — ainda não está registado. Adiantamentos, despesas e compras ficam «por confirmar com PIN».' },
    { title: 'Com o Beauty OS aberto e com ligação.', text: 'Os serviços guardados são enviados, do mais antigo para o mais recente. Se o servidor não aceitar um, fica em «Para rever».' },
    { title: 'Os rascunhos esperam pelo PIN.', text: 'Não seguem sozinhos: só passam a registo quando alguém os confirma com o PIN, com ligação.' },
  ]
  return (
    <Microanimation title="O que acontece sem ligação" durationMs={3400} frames={frames}>
      {/* before «Ver», the stage already shows the offline state: a service waiting on the phone and a draft */}
      <div className="ma-lanes"><span className="ma-lane-title">Este telemóvel</span><span className="ma-lane-title">Servidor</span></div>
      <div className="ma-lanes">
        <div className="ma-send" style={delay(1500)}>
          <div className="ma-box">
            <span>Serviço
              <span className="ma-stack ma-sub">
                <span className="ma-out" style={delay(2250)}>por enviar</span>
                <span className="ma-in" style={delay(2250)}>registado</span>
              </span>
            </span>
            <span className="ma-stack">
              <span className="ma-out" style={delay(2250)}><Icon name="clock" size={18} /></span>
              <span className="ma-in" style={delay(2250)}><Icon name="check" size={18} /></span>
            </span>
          </div>
        </div>
      </div>
      <div className="ma-lanes">
        <div className="ma-box"><span>Adiantamento<span className="ma-sub">por confirmar com PIN</span></span><Icon name="lock" size={18} /></div>
      </div>
      <div className="ma-stack">
        <span className="ma-out" style={delay(1000)}><p className="ma-caption">Sem ligação: o serviço fica «Guardado neste telemóvel»; o adiantamento fica por confirmar.</p></span>
        <p className="ma-caption ma-in" style={delay(1050)}>Beauty OS aberto, com ligação: os serviços guardados são enviados.</p>
      </div>
      <p className="ma-caption ma-in" style={delay(2500)}>Se o servidor não aceitar um serviço, fica em «Para rever».</p>
      <p className="ma-caption ma-in" style={delay(3000)}>O adiantamento fica: só passa a registo com o PIN, com ligação.</p>
    </Microanimation>
  )
}

const DEMOS: Record<HelpAnimation, () => JSX.Element> = { misto: MistoDemo, stock: StockDemo, offline: OfflineDemo }

/** The topic's microanimation, when it has one. */
export function TopicAnimation({ id }: { id: HelpAnimation }) {
  const Demo = DEMOS[id]
  return <Demo />
}
