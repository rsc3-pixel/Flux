// Versão atual do app + lista de release notes mostradas no modal "Novidades".
//
// Quando publicar uma atualização nova, faz 3 coisas:
//   1. Bumpa o `version` aqui (ex: "1.1.0" -> "1.2.0")
//   2. Adiciona um bloco no TOPO do array `releases` com a versão nova e o que mudou
//   3. Faz commit + push, depois `git pull && pm2 restart flux` na VM
//
// O frontend compara o `version` retornado por GET /api/version com o que está
// no localStorage do usuário. Se for diferente (e ele já tinha visto algum antes),
// abre o modal mostrando todos os releases acumulados desde a última versão vista.
// Se ele nunca tinha visto nada (primeiro login pós-feature), só registra silenciosamente.

const releases = [
  {
    version: '1.10.4',
    date: '2026-05-22',
    notes: [
      '📱 Aba Tabela agora aparece no menu inferior do celular. No mobile, o quadro fica compacto (Tarefa, Prioridade e Responsável) — pra ver a data de Vencimento e a descrição inteira, é só abrir a linha',
      '✅ Na aba Tabela, abra uma tarefa e use "Concluir" pra mandar direto pro final do quadro, ou escolha outra lista no dropdown — sem precisar abrir o modal',
    ],
  },
  {
    version: '1.10.3',
    date: '2026-05-22',
    notes: [
      '🖱️ Na aba Tabela, clique numa tarefa pra ela abrir ali mesmo e mostrar a descrição completa, sem trocar de tela. Tem um botão "Editar" dentro pra quando precisar mudar algo',
    ],
  },
  {
    version: '1.9.1',
    date: '2026-05-11',
    notes: [
      '🔐 Agora dá pra trocar a senha em Configurações — útil pra atualizar de tempos em tempos ou logo após receber uma senha temporária',
      '🔑 Esqueceu a senha? Manda mensagem pelo botão "Contato" — o owner consegue gerar uma senha temporária pra você no painel de admin',
    ],
  },
  {
    version: '1.8.10',
    date: '2026-05-11',
    notes: [
      '📱 Mobile: agora dá pra rolar a lista de cards normalmente — antes qualquer toque era interpretado como início de arrastar. Pra arrastar um card pra outra coluna, agora segure por meio segundo antes de mover',
    ],
  },
  {
    version: '1.8.7',
    date: '2026-05-11',
    notes: [
      '💬 Botão "Reportar bug" virou "Contato" — agora você usa o mesmo canal pra mandar dúvida, sugestão ou problema. A página "Como usar" também ganhou um botão grande "Falar com a gente" pra deixar isso óbvio',
    ],
  },
  {
    version: '1.8.4',
    date: '2026-05-11',
    notes: [
      '✨ Tour interativo pelo Flux — abre a aba "Como usar" na barra lateral e clique em "Fazer um tour rápido". 5 passos com destaque visual mostrando onde fica cada coisa importante. Bom pra mostrar pra quem tá começando',
    ],
  },
  {
    version: '1.8.2',
    date: '2026-05-11',
    notes: [
      '📖 Nova aba "Como usar" na barra lateral — guia em português coloquial pra aprender (ou relembrar) como mexer no Flux. Boa pra mostrar pra quem tá começando',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-05-11',
    notes: [
      '👋 Quadros e listas vazios agora explicam o que fazer em vez de aparecer em branco — pra ajudar quem tá usando o Flux pela primeira vez',
      '💡 Passe o mouse sobre os botões da barra lateral pra ver uma descrição rápida do que cada um faz',
      '🎨 Barra de rolagem agora segue o tema (sai do branco gritante no modo escuro)',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-05-10',
    notes: [
      '☀️ Nova aba "Hoje" na sidebar — abre o dia inteiro e os próximos 7 dias num só lugar, juntando cards de todos os seus quadros. Pra abrir o app de manhã e bater o olho no que tem pra fazer sem precisar pular entre quadros',
      '📅 Cards de período (com data de início + fim) aparecem em "Hoje" enquanto estiverem em andamento — útil pra férias, plantões longos e qualquer compromisso que dure mais de um dia',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-05-10',
    notes: [
      '🎨 Categoria personalizada nos cards — escolha "+ Personalizado…" no campo Categoria do card pra definir um nome e cor próprios (até 30 caracteres). Ideal pra rotular do seu jeito sem se prender às categorias padrão',
    ],
  },
  {
    version: '1.6.3',
    date: '2026-05-10',
    notes: [
      '💸 Card "Conta a pagar" agora vira transação no Finanças automaticamente — escolha a categoria "Conta a pagar" no card, preencha o valor, e use "Marcar como pago" pra registrar a despesa em um clique',
      '👁️ Card de conta a pagar mostra o valor + status (vence DD/MM ou ✅ pago) direto na visão Kanban',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-05-10',
    notes: [
      '💰 Módulo Finanças (em construção, controlado por feature flag) — cadastro de receitas e despesas, filtros por mês, dashboard simples. Owner pode ligar/desligar pelo painel admin.',
    ],
  },
  {
    version: '1.5.5',
    date: '2026-05-09',
    notes: [
      '📱 Painel Admin agora cabe direito no celular — layout responsivo nas seções de feature flags e usuários',
      '🚪 Toggle "Cadastros abertos" no painel — você liga/desliga novos cadastros direto pela UI (antes era só via SSH)',
    ],
  },
  {
    version: '1.5.4',
    date: '2026-05-09',
    notes: [
      '👁️ Painel Admin agora tem "Modo preview" — o owner consegue ver o app exatamente como um usuário comum vê (sem botão Admin, com feature flags aplicadas)',
    ],
  },
  {
    version: '1.5.3',
    date: '2026-05-09',
    notes: [
      '🗑️ Painel Admin agora permite excluir usuários permanentemente — com confirmação digitando o email pra evitar acidentes',
    ],
  },
  {
    version: '1.5.2',
    date: '2026-05-09',
    notes: [
      '👥 Painel Admin agora tem gestão de usuários — listar, buscar, suspender/reativar contas direto do app (sem precisar de SSH)',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-05-09',
    notes: [
      '🎛️ Painel Admin agora tem feature flags — controle pra ligar/desligar módulos sem precisar de deploy',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-05-09',
    notes: [
      '🛡️ Painel Admin (apenas pro dono do app) — base pra próximas funcionalidades de gestão',
    ],
  },
  {
    version: '1.4.3',
    date: '2026-05-09',
    notes: [
      '🛠️ Botão "Reportar bug" voltou a funcionar — se você tentou reportar algo recentemente e apareceu "Sistema de envio de bugs indisponível", pode mandar agora normalmente',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-05-05',
    notes: [
      '🗂️ Convidar para vários quadros de uma vez — ao gerar um link de convite, marque também outros quadros que você gerencia; um link só dá acesso a todos eles',
      '👁️ Convites pendentes mostram quais quadros são cobertos quando o convite é multi-quadro',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-05-05',
    notes: [
      '🏠 Clicar no logo "Flux" da sidebar agora volta direto pro quadro Kanban — atalho rápido pra sair de Atividade, Analytics ou Settings sem ter que clicar duas vezes',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-05-05',
    notes: [
      '🔐 Convidar pessoas por email — ao gerar um link de convite, agora você lista os emails autorizados; só quem entrar com um desses emails consegue acessar o quadro',
      '👥 Um link funciona pra equipe inteira — adicione vários emails e mande o mesmo link no grupo; cada pessoa entra com a conta dela',
      '📋 Convites pendentes — veja quem já entrou e quem ainda não, e revogue links a qualquer momento',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-05-05',
    notes: [
      '🛟 App agora se recupera sozinho de cache desatualizado — em vez de "tela azul" travada, mostra um botão "Recarregar" pra você sair do limbo',
      '🔧 Service worker mais resiliente — atualizações deixam de travar se um arquivo demorar pra baixar',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-05-03',
    notes: [
      '🎨 Logo do Flux redesenhada — visual mais moderno na tela de login, no favicon e no ícone do app instalado',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-04-30',
    notes: [
      '🖱️ Arraste os quadros na sidebar pra reordenar do seu jeito — o que estiver no topo é o que abre primeiro quando você entra no site',
      '📌 A ordem é por usuário — cada membro de um quadro compartilhado pode organizar a sidebar como preferir, sem afetar os outros',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-04-26',
    notes: [
      '✅ Checklist nos cards — adicione subtarefas/itens em qualquer card, marque como feito e acompanhe o progresso. Perfeito pra lista de compras, passos de uma tarefa ou subtarefas',
      '🟢 Nova categoria LISTA — cor verde-esmeralda pra quando o card é uma lista de itens (ex.: lista de mercado)',
      '📊 Progresso no card — quando o card tem checklist, o quadro mostra um indicador "2/5 ✓" pra você ver o avanço sem abrir',
    ],
  },
  {
    version: '1.1.3',
    date: '2026-04-26',
    notes: [
      '⚡ App agora atualiza sozinho — quando uma versão nova é publicada, o app recarrega automaticamente sem você precisar fazer nada',
    ],
  },
  {
    version: '1.1.2',
    date: '2026-04-26',
    notes: [
      '📱 Atualizações agora chegam no celular sem precisar reinstalar — service worker passou a usar estratégia network-first pra carregar a versão mais nova',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-04-26',
    notes: [
      '🔧 Corrige modal "Novidades" que não aparecia na primeira vez',
      '🔒 Reconhecimento correto do IP atrás do proxy (rate limit mais robusto)',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04-26',
    notes: [
      '🐛 Botão "Reportar bug" na sidebar — agora dá pra mandar feedback direto pro time sem sair do app',
      '✨ Modal "Novidades" — toda atualização nova vai aparecer aqui pra você não perder nenhuma melhoria',
    ],
  },
];

module.exports = {
  current: releases[0].version,
  releases,
};
