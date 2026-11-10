# Gera SQL com dados fictícios (empresa começa com "_") para a conta do usuário. Determinístico (seed fixa).
# Uso: python3 gerar_mock.py <user_id> saida.sql  (depois rode o SQL no SQL Editor do Supabase)
# Para apagar só os fictícios: remover_mock.sql
import json, random, sys, uuid
from datetime import date, datetime, timedelta, timezone

random.seed(42)
USER = sys.argv[1]
HOJE = date(2026, 11, 10)
BRT = timezone(timedelta(hours=-3))

CIDADES = ['Caçu', 'Bom Jesus de Goiás', 'Rio Verde']
EMPRESAS = [
    ('Transportadora Boa Viagem', 'frota', 14), ('Agro Cerrado Grãos', 'frota', 9), ('Construtora Pedra Firme', 'frota', 6),
    ('Distribuidora Sabor do Campo', 'frota', 11), ('Locadora Estrada Livre', 'frota', 22), ('Mercadinho Dois Irmãos', 'PF', None),
    ('Auto Peças Rota 452', 'frota', 3), ('Fazenda Santa Luzia', 'frota', 8), ('Clínica Vida Plena', 'PF', None),
    ('Padaria Pão Dourado', 'PF', None), ('Logística Rio Claro', 'frota', 30), ('Ferragista Bom Preço', 'frota', 2),
    ('Pet Shop Patinhas', 'PF', None), ('Usina Verde Canavial', 'frota', 45), ('Telecom Conecta', 'frota', 16),
    ('Revenda Motos Cerrado', 'frota', 4), ('Material de Construção Alicerce', 'frota', 5), ('Posto Avenida Central', 'frota', 3),
    ('Laticínios Serra Azul', 'frota', 12), ('Escola Pequeno Saber', 'PF', None), ('Farmácia Saúde Já', 'PF', None),
    ('Mudanças Expresso Goiás', 'frota', 7), ('Garagem Primeira Linha', 'frota', 10), ('Supermercado Vila Nova', 'frota', 4),
    ('Engenharia Horizonte', 'frota', 5), ('Calcário Vale do Paranaíba', 'frota', 18), ('Oficina Motor Forte', 'PF', None),
    ('Sementes Boa Safra', 'frota', 6), ('Guincho Pronto Socorro', 'frota', 3), ('Imobiliária Lar Feliz', 'PF', None),
    ('Agropecuária Campo Bom', 'frota', 4), ('Táxi Aéreo Cerrado', 'frota', 2), ('Transportes Irmãos Rocha', 'frota', 25),
    ('Armazém Grão de Ouro', 'frota', 9), ('Bar e Restaurante Tropeiro', 'PF', None), ('Vidraçaria Cristal', 'frota', 2),
    ('Cooperativa Mista Rural', 'frota', 35), ('Serralheria Aço Forte', 'PF', None), ('Rede Drogaria Popular BJ', 'frota', 3),
    ('Hortifruti Fresquinho', 'frota', 2),
]
CONTATOS_NOME = ['Seu Antônio, dono', 'Marcos, gerente de frota', 'Dona Cida, sócia', 'Rafael, filho do dono', 'Juliana, financeiro',
                 'Paulo, encarregado', 'Fernanda, proprietária', 'Zé Carlos, sócio', 'Luciana, administrativo', 'Roberto, diretor']
OBS_VISITA = {
    'sem_interesse': ['{c}. Disse que o seguro atual atende e não quer trocar agora.', '{c}. Achou caro em relação ao que paga hoje; não quis ver proposta.',
                      '{c}. Empresa passando por aperto de caixa, sem espaço para custo novo.'],
    'agendou': ['{c}. Gostou da conversa e marcou retorno para ver números com o sócio.', '{c}. Pediu para voltar com material impresso; ficou de reunir os documentos dos veículos.',
                '{c}. Atendeu rápido entre um cliente e outro; agendou conversa com calma.'],
    'cotacao': ['{c}. Passou a lista de placas para cotação; quer comparar com a renovação que vence em breve.', '{c}. Pediu cotação para a frota inteira; hoje paga mais caro na concorrência.',
                '{c}. Interessado na assistência 24h com guincho; pediu cotação de {n} veículos.'],
    'venda': ['{c}. Fechou proteção para {n} veículos. Pagamento no boleto, início no dia 1º.', '{c}. Fechou na hora após comparar com a concorrência; pediu para incluir o carro da esposa depois.'],
}
OBS_RETORNO = {
    'sem_interesse': ['Retornei: decidiu renovar com a seguradora atual.', 'Retorno por ligação: sem interesse no momento, pediu para tentar no ano que vem.'],
    'agendou': ['Retornei, dono não estava; remarcamos para a semana que vem.', 'Conversa boa, mas o sócio ainda precisa aprovar; nova visita marcada.'],
    'cotacao': ['Enviei a cotação pelo WhatsApp; achou o valor competitivo e vai analisar.', 'Apresentei a cotação; pediu desconto para fechar a frota toda.'],
    'venda': ['Fechou! Proteção ativada para a frota.', 'Assinou o contrato após ajustar a franquia.'],
}
MOTIVOS = ['Preço', 'Já tem seguro', 'Não vê necessidade', 'Vai pensar']
PASSOS = {'1_dono_ausente': 'Voltar para falar com o dono', '2_ja_tem_seguro': 'Retornar antes do vencimento do seguro',
          '3_recusou': 'Nova abordagem', '4_interessado': 'Retornar: cliente interessado', 'indicacao': 'Contatar a indicação'}
DIAS = {'1_dono_ausente': 3, '2_ja_tem_seguro': 30, '3_recusou': 60, '4_interessado': 3, 'indicacao': 1}

def ts(d, h, m):
    return datetime(d.year, d.month, d.day, h, m, tzinfo=BRT).isoformat()

def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

leads, contatos = [], []
for i, (nome, tipo, nv) in enumerate(EMPRESAS):
    lid = str(uuid.UUID(int=random.getrandbits(128), version=4))
    dia = HOJE - timedelta(days=random.randint(0, 27))
    while dia.weekday() == 6: dia -= timedelta(days=1)  # sem domingo
    cidade = random.choice(CIDADES)
    origem = 'indicacao' if random.random() < 0.18 else 'abordagem'
    estrategia = random.choices(['visita_agenda', 'visita_fecha', 'ligacao'], [5, 3, 2])[0]
    decisor = random.random() < 0.6
    contato = random.choice(CONTATOS_NOME) if decisor else random.choice(['Funcionário do balcão', 'Recepcionista', 'Vendedor da loja'])
    r1 = random.choices(['sem_interesse', 'agendou', 'cotacao', 'venda'], [3, 4, 4, 1] if decisor else [3, 6, 1, 0])[0]
    n = nv or 1
    hist = [(dia, r1, random.choice(OBS_VISITA[r1]).format(c=('Falei com ' + contato) if decisor else (contato + ' atendeu; dono ausente'), n=n))]
    # retornos depois da visita
    atual = r1
    d = dia
    for _ in range(random.choices([0, 1, 2], [5, 4, 2])[0]):
        if atual in ('venda', 'sem_interesse'): break
        d = d + timedelta(days=random.randint(2, 6))
        if d >= HOJE: break
        atual = random.choices(['sem_interesse', 'agendou', 'cotacao', 'venda'], [2, 2, 4, 2])[0]
        hist.append((d, atual, random.choice(OBS_RETORNO[atual])))
    if atual == 'venda': faixa = '4_interessado'
    elif atual == 'sem_interesse': faixa = random.choice(['2_ja_tem_seguro', '3_recusou'])
    elif origem == 'indicacao' and len(hist) == 1: faixa = 'indicacao'
    elif not decisor and len(hist) == 1: faixa = '1_dono_ausente'
    else: faixa = '4_interessado'
    vencimento = None
    if faixa == '2_ja_tem_seguro' and random.random() < 0.6:
        vencimento = HOJE + timedelta(days=random.randint(30, 200))
    if atual == 'venda':
        passo, dprox = None, None
    else:
        passo = PASSOS[faixa]
        # mistura de atrasados, hoje e futuros
        dprox = random.choice([HOJE - timedelta(days=random.randint(1, 6)), HOJE, HOJE + timedelta(days=random.randint(1, 20)), d + timedelta(days=DIAS[faixa])])
    arquivado = atual == 'sem_interesse' and faixa == '3_recusou' and random.random() < 0.5
    h, m = random.randint(8, 17), random.choice([0, 7, 15, 22, 30, 41, 50])
    lead = dict(id=lid, user_id=USER, criado_em=ts(dia, h, m), origem=origem,
                indicado_por=('_' + random.choice(['Gilmar da Cometa', 'Marcão da Borracharia', 'Thiago da Tim Motos'])) if origem == 'indicacao' else None,
                empresa='_' + nome, cidade=cidade, n_veiculos=nv, tipo=tipo, estrategia=estrategia, falou_decisor=decisor,
                resultado=atual, faixa_cadencia=faixa, vencimento_seguro=vencimento.isoformat() if vencimento else None,
                proximo_passo=passo, data_proximo_passo=dprox.isoformat() if dprox else None,
                motivo_nao=random.choice(MOTIVOS) if atual == 'sem_interesse' else None, observacao=hist[-1][2], arquivado=arquivado)
    leads.append(lead)
    for k, (dd, res, obs) in enumerate(hist):
        hh, mm = (h, m) if k == 0 else (random.randint(8, 17), random.choice([5, 20, 35, 48]))
        contatos.append(dict(id=str(uuid.UUID(int=random.getrandbits(128), version=4)), user_id=USER, lead_id=lid,
                             data=ts(dd, hh, mm), resultado=res, observacao=obs))

cl = list(leads[0].keys()); cc = list(contatos[0].keys())
sql = f"insert into public.leads ({','.join(cl)}) values\n" + ',\n'.join('(' + ','.join(q(l[c]) for c in cl) + ')' for l in leads) + ';\n'
sql += f"insert into public.contatos ({','.join(cc)}) values\n" + ',\n'.join('(' + ','.join(q(x[c]) for c in cc) + ')' for x in contatos) + ';\n'
open(sys.argv[2], 'w').write(sql)
from collections import Counter
print(len(leads), 'leads,', len(contatos), 'contatos')
print('resultado:', Counter(l['resultado'] for l in leads))
print('arquivados:', sum(l['arquivado'] for l in leads), '| atrasados:', sum(1 for l in leads if l['data_proximo_passo'] and l['data_proximo_passo'] < HOJE.isoformat() and not l['arquivado']),
      '| hoje:', sum(1 for l in leads if l['data_proximo_passo'] == HOJE.isoformat() and not l['arquivado']))
print('frota abordagem:', sum(1 for l in leads if l['tipo'] == 'frota' and l['origem'] == 'abordagem'))
