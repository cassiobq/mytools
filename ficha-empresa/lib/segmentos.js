// Segmento a partir do CNAE principal (campo cnae_fiscal da Minha Receita, 7 dígitos).
// Edite à vontade: a chave é o começo do código CNAE (2 a 7 dígitos) e vale a mais longa que casar.
// Sem correspondência, usa a descrição oficial do CNAE (nunca inventa um segmento).
// Consulta de códigos: https://concla.ibge.gov.br/busca-online-cnae.html
export const SEGMENTOS_POR_CNAE = {
  // Alimentação e varejo alimentar
  '4711': 'Supermercado', // hipermercados e supermercados
  '4712': 'Supermercado', // minimercados, mercearias e armazéns
  '4721': 'Padaria',
  '1091': 'Padaria',
  '4722': 'Açougue',
  '4723': 'Bebidas',
  '4724': 'Hortifrúti',
  '4729': 'Alimentos',
  '5611201': 'Restaurante',
  '5611203': 'Lanchonete',
  '5611204': 'Bar',
  '5611205': 'Bar',
  '5611': 'Restaurante',
  '5620': 'Alimentação',
  // Saúde e beleza
  '4771704': 'Agropecuária', // medicamentos veterinários
  '4771': 'Farmácias',
  '4772': 'Cosméticos e Perfumaria',
  '4774': 'Ótica',
  '8630504': 'Odontologia',
  '8630': 'Clínica Médica',
  '8640': 'Laboratório',
  '8650': 'Saúde',
  '9602501': 'Salão de Beleza',
  '9602502': 'Estética',
  '9313': 'Academia',
  '7500': 'Veterinária',
  // Veículos
  '4511': 'Concessionária',
  '4520': 'Oficina Mecânica',
  '4530': 'Autopeças',
  '4541': 'Motos',
  '4542': 'Motos',
  '4543': 'Motos',
  '4731': 'Posto de Combustível',
  // Casa e construção
  '4741': 'Material de Construção',
  '4742': 'Material de Construção',
  '4743': 'Material de Construção',
  '4744': 'Material de Construção',
  '4751': 'Informática',
  '4752': 'Eletrônicos',
  '4753': 'Eletrodomésticos',
  '4754': 'Móveis',
  '4755': 'Tecidos e Cama, Mesa e Banho',
  '4759': 'Utilidades Domésticas',
  '4120': 'Construtora',
  '6821': 'Imobiliária',
  '6822': 'Imobiliária',
  // Moda e outros varejos
  '4781': 'Vestuário',
  '4782': 'Calçados',
  '4783': 'Joalheria',
  '4761': 'Papelaria',
  '4763': 'Artigos Esportivos',
  '4789004': 'Pet Shop',
  // Agro
  '01': 'Agronegócio',
  '4623': 'Agropecuária',
  '4683': 'Agropecuária',
  // Serviços
  '5510': 'Hotel',
  '85': 'Educação',
  '6911': 'Advocacia',
  '6920': 'Contabilidade',
  '4930': 'Transportadora',
  '6422': 'Banco',
  '46': 'Atacado e Distribuidora',
};

const CHAVES = Object.keys(SEGMENTOS_POR_CNAE).sort((a, b) => b.length - a.length);

export function segmentoPorCnae(cnae, descricao = '') {
  const codigo = String(cnae ?? '').replace(/\D/g, '').padStart(7, '0');
  if (codigo === '0000000') return { segmento: String(descricao ?? '').trim(), origem: descricao ? 'cnae' : null };
  const chave = CHAVES.find((k) => codigo.startsWith(k));
  if (chave) return { segmento: SEGMENTOS_POR_CNAE[chave], origem: 'tabela' };
  const desc = String(descricao ?? '').trim();
  return { segmento: desc, origem: desc ? 'cnae' : null };
}
