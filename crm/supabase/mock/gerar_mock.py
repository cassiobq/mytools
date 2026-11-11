# Gera SQL com dados fictícios (empresa começa com "_") no formato v3 (com ações de vendas): pesquisa da abordagem,
# funil (Lead > MQL > SQL > Venda > Associado), no-show, perdas, bandeiras e lead dos segurados.
# Determinístico (seed fixa). Uso: python3 gerar_mock.py <user_id> saida.sql
# Para apagar só os fictícios: remover_mock.sql
import random, sys, uuid
from datetime import date, datetime, timedelta, timezone

random.seed(7)
USER = sys.argv[1]
HOJE = date(2026, 11, 11)
INICIO = date(2026, 9, 28)  # 6 semanas e meia
BRT = timezone(timedelta(hours=-3))

CIDADES = ['Rio Verde'] * 5 + ['Caçu'] * 2 + ['Bom Jesus de Goiás'] * 2 + ['Jataí']
NOMES = ['Transportadora Boa Viagem', 'Agro Cerrado Grãos', 'Construtora Pedra Firme', 'Distribuidora Sabor do Campo', 'Locadora Estrada Livre',
         'Mercadinho Dois Irmãos', 'Auto Peças Rota 452', 'Fazenda Santa Luzia', 'Clínica Vida Plena', 'Padaria Pão Dourado', 'Logística Rio Claro',
         'Ferragista Bom Preço', 'Pet Shop Patinhas', 'Usina Verde Canavial', 'Telecom Conecta', 'Revenda Motos Cerrado', 'Material de Construção Alicerce',
         'Posto Avenida Central', 'Laticínios Serra Azul', 'Escola Pequeno Saber', 'Farmácia Saúde Já', 'Mudanças Expresso Goiás', 'Garagem Primeira Linha',
         'Supermercado Vila Nova', 'Engenharia Horizonte', 'Calcário Vale do Paranaíba', 'Oficina Motor Forte', 'Sementes Boa Safra', 'Guincho Pronto Socorro',
         'Imobiliária Lar Feliz', 'Agropecuária Campo Bom', 'Transportes Irmãos Rocha', 'Armazém Grão de Ouro', 'Bar e Restaurante Tropeiro', 'Vidraçaria Cristal',
         'Cooperativa Mista Rural', 'Serralheria Aço Forte', 'Drogaria Popular', 'Hortifruti Fresquinho', 'Elétrica Faísca', 'Gráfica Impressão Rápida',
         'Academia Corpo em Forma', 'Contabilidade Exata', 'Madeireira Ipê', 'Frigorífico Boi Gordo', 'Distribuidora de Gás Chama Azul', 'Lava Jato Brilho',
         'Climatização Ar Puro', 'Floricultura Jardim', 'Ótica Visão Clara', 'Marmoraria Granito Fino', 'Auto Escola Direção Certa', 'Pneus Rodovia',
         'Topografia Marco Zero', 'Buffet Sabor de Festa', 'Paisagismo Verde Vivo', 'Vidros e Box Transparente', 'Tapeçaria Conforto', 'Cerealista Safra Boa',
         'Laboratório Análise', 'Hotel Pousada do Viajante', 'Funerária Paz', 'Construtora Novo Lar', 'Transporte Escolar Tia Rosa']
DECISORES = ['Antônio', 'Marcos', 'Cida', 'Rafael', 'Juliana', 'Paulo', 'Fernanda', 'Zé Carlos', 'Luciana', 'Roberto', 'Simone', 'Gilmar', 'Thiago', 'Patrícia', 'Wesley']
CARGOS = ['dono', 'sócio', 'gerente', 'proprietária', 'diretor', 'gestor de frota']
SEGURADORAS = ['Porto Seguro'] * 4 + ['Allianz'] * 2 + ['Bradesco Seguros'] * 2 + ['Tokio Marine', 'HDI', 'Mapfre', 'Azul Seguros', 'AAGO (proteção)']
MOTIVOS_SEM = ['Condição financeira'] * 4 + ['Não é prioridade'] * 4 + ['Vou vender o veículo'] * 2 + ['Acha que nunca vai precisar']
PERDA = {'lead': ['Não quis agendar reunião'], 'mql': ['Desmarcou e não remarcou', 'Não compareceu de novo', 'Sem interesse'],
         'sql': ['Preço', 'Preço', 'Fechou com concorrente', 'Sem retorno', 'Cobertura não atende'],
         'venda': ['Desistiu antes de assinar', 'Reprovado na vistoria']}

def ts(d, h, m):
    return datetime(d.year, d.month, d.day, h, m, tzinfo=BRT).isoformat()

def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def util(d):  # empurra para dia útil
    while d.weekday() >= 5: d += timedelta(days=1)
    return d

leads, contatos, acoes = [], [], []
RUAS = ['Av. Presidente Vargas', 'Rua Rui Barbosa', 'Av. Brasil', 'Distrito Industrial', 'Av. Goiás', None, 'Rua Costa Gomes', 'Setor Morada do Sol', None]
def contato(lead, d, evento, etapa, **kw):
    contatos.append({'id': str(uuid.uuid4()), 'lead_id': lead['id'], 'data': ts(d, random.randint(8, 17), random.randint(0, 59)),
                     'evento': evento, 'etapa': etapa, 'veiculos': kw.get('veiculos'), 'decisor': kw.get('decisor'),
                     'motivo': kw.get('motivo'), 'observacao': kw.get('obs')})

def agendar(lead, tipo, d, passo, hora=True):
    lead.update(proximo_tipo=tipo, data_proximo_passo=d.isoformat(), proximo_passo=passo,
                hora_proximo_passo=f'{random.choice([8, 9, 10, 14, 15, 16])}:{random.choice(["00", "30"])}' if hora else None)

def sem_proximo(lead):
    lead.update(proximo_tipo=None, data_proximo_passo=None, hora_proximo_passo=None, proximo_passo=None)

random.shuffle(NOMES)
dia = INICIO
i = 0
while dia <= HOJE and i < len(NOMES):
    if dia.weekday() >= 5: dia += timedelta(days=1); continue
    A = {'id': str(uuid.uuid4()), 'criado_em': ts(dia, 7, random.randint(30, 55)), 'cidade': random.choice(CIDADES), 'endereco': random.choice(RUAS), 'finalizada_em': None}
    if acoes: acoes[-1]['finalizada_em'] = A['criado_em']
    acoes.append(A)
    for _ in range(random.choice([1, 2, 2, 3])):
        if i >= len(NOMES): break
        nome = '_' + NOMES[i]; i += 1
        L = {'id': str(uuid.uuid4()), 'criado_em': ts(dia, random.randint(8, 11), random.randint(0, 59)), 'origem': 'indicacao' if random.random() < .15 else 'abordagem',
             'indicado_por': None, 'empresa': nome, 'cidade': A['cidade'], 'acao_id': A['id'], 'falou_decisor': None, 'decisor_nome': None, 'decisor_whatsapp': None,
             'n_veiculos': None, 'veiculos_mais': False, 'n_segurados': None, 'seguradora': None, 'vencimento_seguro': None, 'nota_seguro': None,
             'motivo_sem_seguro': None, 'bandeira': False, 'motivo_bandeira': None, 'etapa': 'lead', 'lead_pai_id': None, 'observacao': None, 'motivo_nao': None,
             'arquivado': False}
        if L['origem'] == 'indicacao': L['indicado_por'] = '_' + random.choice(DECISORES) + ' (cliente)'
        sem_proximo(L)
        leads.append(L)
        d = dia
        decisor_ja = random.random() < .72
        if not decisor_ja:
            contato(L, d, 'abordagem', 'lead', decisor=False, obs='Decisor não estava; deixei cartão com a recepção.')
            L['falou_decisor'] = False
            volta = util(d + timedelta(days=random.choice([2, 3, 4])))
            if volta > HOJE or random.random() < .3:
                agendar(L, 'retorno', volta, 'Retorno: falar com o decisor'); continue
            d = volta; evento = 'retorno'
            if random.random() < .25:  # 2ª vez sem decisor
                contato(L, d, 'retorno', 'lead', decisor=False, obs='De novo sem o decisor.')
                agendar(L, 'retorno', util(d + timedelta(days=3)), 'Retorno: falar com o decisor'); continue
        else:
            evento = 'abordagem'
        # Falou com o decisor: pesquisa
        nv = random.choices([0, 1, 2, 3, 4, 6, 9, 14, 22], [12, 20, 20, 12, 8, 9, 8, 6, 5])[0]
        nome_d = random.choice(DECISORES)
        L.update(falou_decisor=True, decisor_nome=f'{nome_d}, {random.choice(CARGOS)}', decisor_whatsapp=f'(64) 9{random.randint(8100, 9999)}-{random.randint(1000, 9999)}',
                 n_veiculos=nv)
        if nv == 0:
            L.update(bandeira=True, motivo_bandeira='Sem veículos')
            contato(L, d, evento, 'lead', decisor=True, obs=f'{nome_d}: empresa não tem veículo próprio.'); continue
        perfil = random.choices(['todos', 'nenhum', 'parte'], [40, 35, 25])[0]
        if nv == 1 and perfil == 'parte': perfil = 'nenhum'
        ns = nv if perfil == 'todos' else 0 if perfil == 'nenhum' else random.randint(1, nv - 1)
        L['n_segurados'] = ns
        if ns > 0:
            L.update(seguradora=random.choice(SEGURADORAS), nota_seguro=random.choices([0, 1, 2, 3, 4, 5], [3, 5, 12, 20, 30, 30])[0])
            v = HOJE + timedelta(days=random.randint(10, 330))
            L['vencimento_seguro'] = date(v.year, v.month, 1).isoformat()
        if ns == nv:  # todos segurados: volta no vencimento
            if L['nota_seguro'] >= 4: L.update(bandeira=True, motivo_bandeira='Satisfeito com o seguro')
            agendar(L, 'vencimento', date.fromisoformat(L['vencimento_seguro']), f"Vencimento do seguro ({L['seguradora']})", hora=False)
            contato(L, d, evento, 'lead', decisor=True, obs=f"{nome_d}: frota toda na {L['seguradora']}, nota {L['nota_seguro']}."); continue
        sem = nv - ns
        L['motivo_sem_seguro'] = random.choice(MOTIVOS_SEM)
        contato(L, d, evento, 'lead', decisor=True, obs=f"{nome_d}: {sem} veículo(s) sem proteção ({L['motivo_sem_seguro'].lower()}).")
        if ns > 0 and random.random() < .85:  # lead dos segurados
            F = dict(L, id=str(uuid.uuid4()), lead_pai_id=L['id'], n_veiculos=ns, n_segurados=ns, motivo_sem_seguro=None,
                     observacao=f'Veículos segurados de {nome}.', bandeira=L['nota_seguro'] >= 4,
                     motivo_bandeira='Satisfeito com o seguro' if L['nota_seguro'] >= 4 else None)
            agendar(F, 'vencimento', date.fromisoformat(L['vencimento_seguro']), f"Vencimento do seguro ({L['seguradora']})", hora=False)
            leads.append(F)
        if random.random() > .58:
            L['etapa'] = 'perdido'; L['motivo_nao'] = 'Não quis agendar reunião'
            contato(L, d, 'perda', 'lead', motivo='Não quis agendar reunião'); continue
        # MQL
        contato(L, d, 'mql', 'lead'); L['etapa'] = 'mql'
        reuniao = util(d + timedelta(days=random.randint(2, 6)))
        if reuniao > HOJE: agendar(L, 'reuniao', reuniao, 'Reunião'); continue
        d = reuniao
        if random.random() < .18:
            contato(L, d, 'no_show', 'mql', obs='Cliente não estava na hora marcada.')
            d2 = util(d + timedelta(days=random.randint(2, 5)))
            if d2 > HOJE or random.random() < .3: agendar(L, 'reuniao', d2, 'Reunião'); continue
            d = d2
        r = random.random()
        if r < .2:
            L['etapa'] = 'perdido'; m = random.choice(PERDA['mql']); L['motivo_nao'] = m
            contato(L, d, 'perda', 'mql', motivo=m); sem_proximo(L); continue
        cot = max(1, sem - (1 if sem > 3 and random.random() < .4 else 0))
        contato(L, d, 'sql', 'mql', veiculos=cot, obs=f'Reunião feita; cotação de {cot} veículo(s).'); L['etapa'] = 'sql'
        ret = util(d + timedelta(days=random.randint(2, 9)))
        if ret > HOJE or random.random() < .25:
            agendar(L, 'negociacao', ret if ret > HOJE else util(d + timedelta(days=2)), 'Retorno da cotação', hora=False); continue
        d = ret
        r = random.random()
        if r < .35:
            L['etapa'] = 'perdido'; m = random.choice(PERDA['sql']); L['motivo_nao'] = m
            contato(L, d, 'perda', 'sql', motivo=m); sem_proximo(L); continue
        vend = cot if random.random() < .7 else max(1, cot - 1)
        contato(L, d, 'venda', 'sql', veiculos=vend, obs=f'Fechou {vend} veículo(s).'); L['etapa'] = 'venda'
        ass = util(d + timedelta(days=random.randint(1, 6)))
        if ass > HOJE or random.random() < .15: agendar(L, 'contrato', max(ass, HOJE), 'Assinatura do contrato', hora=False); continue
        if random.random() < .1:
            L['etapa'] = 'perdido'; m = random.choice(PERDA['venda']); L['motivo_nao'] = m
            contato(L, ass, 'perda', 'venda', motivo=m); sem_proximo(L); continue
        contato(L, ass, 'associado', 'venda', veiculos=vend if random.random() < .85 else max(1, vend - 1), obs='Contrato assinado.')
        L['etapa'] = 'associado'; sem_proximo(L)
    dia += timedelta(days=1)

COLS_A = ['id', 'criado_em', 'cidade', 'endereco', 'finalizada_em']
COLS_L = ['acao_id', 'id', 'criado_em', 'origem', 'indicado_por', 'empresa', 'cidade', 'falou_decisor', 'decisor_nome', 'decisor_whatsapp', 'n_veiculos', 'veiculos_mais',
          'n_segurados', 'seguradora', 'vencimento_seguro', 'nota_seguro', 'motivo_sem_seguro', 'bandeira', 'motivo_bandeira', 'etapa', 'proximo_tipo',
          'data_proximo_passo', 'hora_proximo_passo', 'proximo_passo', 'lead_pai_id', 'observacao', 'motivo_nao', 'arquivado']
COLS_C = ['id', 'lead_id', 'data', 'evento', 'etapa', 'veiculos', 'decisor', 'motivo', 'observacao']
with open(sys.argv[2], 'w') as f:
    f.write('-- Dados fictícios v3 (empresa começa com "_"). Gerado por gerar_mock.py\n')
    f.write(f"insert into public.acoes (user_id, {', '.join(COLS_A)}) values\n")
    f.write(',\n'.join(f"({q(USER)}, " + ', '.join(q(a[c]) for c in COLS_A) + ')' for a in acoes) + ';\n')
    for grupo in ([l for l in leads if not l['lead_pai_id']], [l for l in leads if l['lead_pai_id']]):
        f.write(f"insert into public.leads (user_id, {', '.join(COLS_L)}) values\n")
        f.write(',\n'.join(f"({q(USER)}, " + ', '.join(q(l[c]) for c in COLS_L) + ')' for l in grupo) + ';\n')
    f.write(f"insert into public.contatos (user_id, {', '.join(COLS_C)}) values\n")
    f.write(',\n'.join(f"({q(USER)}, " + ', '.join(q(c[k]) for k in COLS_C) + ')' for c in contatos) + ';\n')
    f.write(f"insert into public.config (id, user_id, metas) values ({q(USER)}, {q(USER)}, "
            "'{\"leads\": 40, \"mql\": 16, \"sql\": 24, \"vendas\": 10, \"associados\": 8}') on conflict (id) do nothing;\n")
ev = {}
for c in contatos: ev[c['evento']] = ev.get(c['evento'], 0) + 1
et = {}
for l in leads: et[l['etapa']] = et.get(l['etapa'], 0) + 1
print(len(acoes), 'ações', len(leads), 'leads', sum(1 for l in leads if l['lead_pai_id']), 'filhos', len(contatos), 'contatos', ev, et,
      'bandeiras', sum(l['bandeira'] for l in leads))
