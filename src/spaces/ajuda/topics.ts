// Ajuda · written help content (learning experience L2, docs/design/learning-experience.md; Help Center V6 as
// corrected in L0). Common to every salon: no tenant data, no prices, no currency, no names — only how the product
// works, checked against the implementation (labels in «» are the app's own; ajuda.test.tsx verifies each one exists).
// Private workflows are explained generically: the help never reads or shows protected data.
// Only written steps exist today; animations (L3) and interactive tutorials (L4) are added to a topic when they exist
// (the topic page lists only content that can be used).
import type { IconName } from '../../shared/ui/Icon'

export type HelpGroup = 'daily' | 'offline' | 'private'

export type HelpTopic = {
  id: string
  group: HelpGroup
  icon: IconName
  title: string
  summary: string
  steps: string[]
  tip?: string
}

export const GROUP_LABEL: Record<HelpGroup, string> = {
  daily: 'Dia a dia',
  offline: 'Sem ligação',
  private: 'Área privada · com PIN',
}

export const TOPICS: readonly HelpTopic[] = [
  {
    id: 'registar-servico', group: 'daily', icon: 'plus',
    title: 'Registar um serviço',
    summary: 'Entre clientes, em três passos. Sem PIN e sem conta.',
    steps: [
      'No Hoje, toque em «Registar serviço».',
      'Em «Quem fez o serviço?», toque no nome de quem fez o serviço.',
      'Em «Que serviço?», escolha o serviço. Os frequentes dessa pessoa aparecem primeiro; «Ver o catálogo completo» mostra os outros.',
      'Confirme o valor (toque em «Editar» só se o cliente pagou outro valor) e a forma de pagamento. «Misto» divide o valor entre duas formas e só aparece quando o salão usa exatamente duas formas de pagamento.',
      'Toque em «Confirmar serviço».',
    ],
    tip: 'O ecrã de sucesso não mostra ganhos nem valores pessoais: o telemóvel é partilhado. Enganou-se? «Corrigir este registo» permite anular o registo e registá-lo de novo. Sem ligação, o serviço fica «Guardado neste telemóvel» — ainda não está registado. É enviado quando o Beauty OS estiver aberto com ligação; se o servidor não o aceitar, fica em «Para rever» em vez de ficar registado.',
  },
  {
    id: 'adiantamento', group: 'daily', icon: 'card',
    title: 'Registar um adiantamento',
    summary: 'Dinheiro entregue a uma pessoa da equipa por conta do que vai receber.',
    steps: [
      'No Hoje, toque em «Adiantamento».',
      'Em «Adiantamento para quem?», toque na pessoa.',
      'Em «Quanto e como?», indique o valor e como foi entregue.',
      'Em «Confirmação necessária», quem confirma escolhe o seu nome e introduz o PIN.',
    ],
    tip: 'Sem ligação, o adiantamento fica guardado neste telemóvel «por confirmar com PIN». Nunca segue sozinho: só passa a registo quando alguém o confirma com o PIN, com ligação (no Hoje, na linha «por confirmar com PIN»).',
  },
  {
    id: 'despesa', group: 'daily', icon: 'receipt',
    title: 'Registar uma despesa',
    summary: 'Contas e gastos do salão que não são produtos para os serviços. Não entra no stock.',
    steps: [
      'No Hoje, toque em «Despesa ou compra» e depois em «Registar despesa».',
      'Em «Que despesa?», escolha o tipo de despesa.',
      'Em «Quanto e como?», indique o valor e como foi paga.',
      'Em «Confirmação necessária», quem confirma escolhe o seu nome e introduz o PIN.',
    ],
    tip: 'Despesa ou compra? Uma despesa é uma conta ou um gasto do salão: não tem produtos e não entra no stock. Os produtos que se usam nos serviços registam-se em «Registar compra», onde também fica quem pagou. Sem ligação, a despesa fica «por confirmar com PIN» e só passa a registo depois dessa confirmação, com ligação.',
  },
  {
    id: 'compra', group: 'daily', icon: 'box',
    title: 'Registar uma compra',
    summary: 'Produtos que usamos nos serviços e ficam no stock.',
    steps: [
      'No Hoje, toque em «Despesa ou compra» e depois em «Registar compra».',
      'Em «O que comprou?», indique os produtos.',
      'Em «Quem pagou?», indique quem pagou: o salão, uma pessoa ou várias.',
      'Em «Confirmação necessária», quem confirma escolhe o seu nome e introduz o PIN.',
    ],
    tip: 'Uma compra nunca muda sozinha o estado do stock: esse é marcado por pessoas, no Stock. Sem ligação, a compra fica «por confirmar com PIN» e só passa a registo depois dessa confirmação, com ligação.',
  },
  {
    id: 'stock', group: 'daily', icon: 'list',
    title: 'Marcar o stock e preparar a compra',
    summary: 'Estado aproximado, marcado pela equipa. Sem contagem automática.',
    steps: [
      'No Hoje, toque em «Stock».',
      'Toque num produto: abre-se a folha do produto. Escolha o estado (OK, Baixo ou Comprar) e toque em «Guardar». Guardar precisa de ligação.',
      'Toque em «Preparar compra» para montar a «Lista de compra».',
      'Toque em «Ir às compras»: o modo mercado acompanha a compra até «Registar compra».',
    ],
    tip: 'Marcar «Comprar» também junta o produto à lista. A ida às compras fica só neste telemóvel até a compra real ser registada.',
  },
  {
    id: 'anular', group: 'daily', icon: 'edit',
    title: 'Anular um registo errado',
    summary: 'Um registo nunca se apaga: anula-se, com motivo, e regista-se de novo se for preciso.',
    steps: [
      'No ecrã de sucesso, toque em «Corrigir este registo» (quem tem acesso também o pode fazer a partir da área privada).',
      'Em «Anular este registo?», escreva o motivo (obrigatório).',
      'Em «Confirmação necessária», quem pode corrigir registos escolhe o seu nome e introduz o PIN.',
      'Se for preciso, registe de novo com os dados certos.',
    ],
    tip: 'Anular precisa de ligação. O registo anulado fica no histórico, com quem anulou e quando.',
  },
  {
    id: 'sem-ligacao', group: 'offline', icon: 'clock',
    title: 'Trabalhar sem ligação',
    summary: 'O que fica guardado neste telemóvel e o que precisa de ligação.',
    steps: [
      '«Registar serviço» funciona sem ligação: aparece «Guardado neste telemóvel». O serviço é enviado quando o Beauty OS estiver aberto com ligação; se o servidor não o aceitar (por exemplo, porque o período já fechou), fica «para rever».',
      'Adiantamentos, despesas e compras ficam como rascunhos «por confirmar com PIN»: só passam a registo quando alguém os confirma com o PIN, com ligação.',
      'A área privada, o Fecho, o Negócio, a Gestão, «Anular» e as alterações ao Stock precisam de ligação.',
      'Para registar sem ligação, o telemóvel tem de ter aberto o Beauty OS com ligação nas últimas 48 horas.',
      'No Hoje, as linhas «por enviar», «por confirmar com PIN» e «para rever» mostram o que ainda está só neste telemóvel; toque numa delas para ver.',
    ],
    tip: 'Não limpe os dados do navegador com registos por enviar. Abra o Beauty OS com ligação: os serviços seguem; os rascunhos esperam pelo PIN.',
  },
  {
    id: 'area-privada', group: 'private', icon: 'person',
    title: 'Entrar na área privada',
    summary: 'Onde aparecem os valores pessoais: só com o PIN da própria pessoa.',
    steps: [
      'No Hoje, toque em «Área privada».',
      'Em «Quem é?», toque no seu nome e introduza o seu PIN.',
      'A área fecha quando sai e ao fim de pouco tempo.',
    ],
    tip: 'Só aparecem os nomes de quem tem acesso. Depois de várias tentativas erradas, essa pessoa fica bloqueada durante algum tempo.',
  },
  {
    id: 'situacao', group: 'private', icon: 'person',
    title: 'Ver a situação de um profissional',
    summary: 'Produção, ganho, adiantamentos e o que falta receber, no período.',
    steps: [
      'Entre na área privada.',
      'Quem tem acesso à equipa vê «Equipa» e toca na pessoa; os outros veem só a sua própria situação.',
      'Veja a produção, o ganho, os adiantamentos e o que falta receber.',
    ],
    tip: 'Quando a regra do período ainda está por definir, o ganho aparece «por definir» — nunca um valor provisório.',
  },
  {
    id: 'fecho', group: 'private', icon: 'calendarCheck',
    title: 'Fechar o período',
    summary: 'Rever exceções, aprovar, pagar e fechar — cada passo só para quem tem essa permissão.',
    steps: [
      'No Hoje, toque em «Fecho» e confirme com o seu PIN. O Fecho só abre a quem tem essa permissão.',
      'Em «Profissionais», resolva o que aparece em «Decidir» e «A rever».',
      'Veja «Despesas, compras e reserva» e a «Posição do período».',
      'Aprove os valores, registe os pagamentos e feche o período. Cada passo pede «Confirmação necessária» de uma pessoa com essa permissão: aprovar, confirmar pagamentos e fechar podem caber a pessoas diferentes.',
    ],
    tip: 'Um período fechado não aceita novos registos. Reabrir é uma permissão à parte, exige um motivo e fica no histórico.',
  },
  {
    id: 'negocio', group: 'private', icon: 'chart',
    title: 'Ver como vai o negócio',
    summary: 'Os números do salão: o que mudou e o que precisa de atenção.',
    steps: [
      'No Hoje, toque em «Negócio» e confirme com o seu PIN.',
      'Comece pela «Visão geral»: «Precisa da tua atenção» e «O que mudou?».',
      'Abra uma secção para ver os números e de onde vêm.',
    ],
    tip: 'O Negócio mostra números do salão, nunca a remuneração de uma pessoa, e só aparece a quem tem acesso.',
  },
  {
    id: 'gestao', group: 'private', icon: 'edit',
    title: 'Mudar serviços e preços',
    summary: 'O catálogo de serviços e produtos.',
    steps: [
      'Na área privada, abra a «Equipa» e toque em «Gestão · Serviços e produtos» (aparece a quem gere o catálogo). Por agora, é este o caminho para a Gestão.',
      'Toque num serviço ou produto para mudar o nome, o preço ou a unidade; «Adicionar serviço» ou «Adicionar produto» cria um novo.',
      'Em «Confirmação necessária», quem gere o catálogo escolhe o seu nome e introduz o PIN.',
    ],
    tip: 'Mudar um preço não muda os registos já feitos. Se gere o catálogo e não encontra a Gestão, fale com o responsável do salão.',
  },
]

export const findTopic = (id: string | undefined): HelpTopic | undefined => TOPICS.find((t) => t.id === id)

/** Lower case, without accents: «serviço» is found by «servico». */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Local search over titles, summaries, steps and tips; every word must match. */
export function searchTopics(query: string): HelpTopic[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return TOPICS.filter((t) => {
    const text = fold([t.title, t.summary, ...t.steps, t.tip ?? ''].join(' '))
    return words.every((w) => text.includes(w))
  })
}
