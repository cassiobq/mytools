// Armazenamento no aparelho (IndexedDB): fila de envio e cópia dos dados para usar sem sinal.
const NOME = 'micro-crm';
const VERSAO = 2;

let conexao;
function abrir() {
  if (!conexao) {
    conexao = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOME, VERSAO);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (e.oldVersion < 1) {
          db.createObjectStore('fila', { keyPath: 'seq', autoIncrement: true });
          db.createObjectStore('leads', { keyPath: 'id' });
          db.createObjectStore('contatos', { keyPath: 'id' });
        }
        if (e.oldVersion < 2) db.createObjectStore('config', { keyPath: 'id' }); // metas e cadência
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return conexao;
}

async function transacao(loja, modo, fn) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(loja, modo);
    const resultado = fn(tx.objectStore(loja));
    tx.oncomplete = () => resolve(resultado?.result ?? resultado);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const todos = (loja) => transacao(loja, 'readonly', (s) => s.getAll());
export const gravar = (loja, obj) => transacao(loja, 'readwrite', (s) => s.put(obj));
export const apagar = (loja, chave) => transacao(loja, 'readwrite', (s) => s.delete(chave));

export async function gravarVarios(loja, objs) {
  return transacao(loja, 'readwrite', (s) => { for (const o of objs) s.put(o); });
}

// Troca a cópia local inteira pelo que veio do banco (só lojas de dados, nunca a fila).
export async function substituir(loja, objs) {
  return transacao(loja, 'readwrite', (s) => { s.clear(); for (const o of objs) s.put(o); });
}

// Acrescenta operações na fila e devolve os números de sequência delas.
export async function enfileirar(ops) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fila', 'readwrite');
    const loja = tx.objectStore('fila');
    const seqs = [];
    for (const op of ops) {
      const req = loja.add({ ...op, criado: Date.now() });
      req.onsuccess = () => seqs.push(req.result);
    }
    tx.oncomplete = () => resolve(seqs);
    tx.onerror = () => reject(tx.error);
  });
}
