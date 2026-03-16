export type CodeLanguage = 'sql' | 'python' | 'javascript' | 'typescript' | 'json' | 'bash' | 'gdscript' | 'csharp' | 'text';

export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'operator' | 'plain' | 'function' | 'decorator';

export interface Token {
  text: string;
  type: TokenType;
}

const SQL_KW = new Set([
  'SELECT','FROM','WHERE','JOIN','ON','GROUP','ORDER','BY','HAVING','LIMIT','OFFSET',
  'INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','DROP','ALTER','ADD',
  'TABLE','INDEX','VIEW','AS','AND','OR','NOT','IN','EXISTS','UNION','ALL',
  'DISTINCT','COUNT','SUM','AVG','MIN','MAX','CASE','WHEN','THEN','ELSE','END',
  'IS','NULL','LIKE','ILIKE','BETWEEN','WITH','INNER','LEFT','RIGHT','FULL','OUTER',
  'CROSS','OVER','PARTITION','RANK','ROW_NUMBER','LAG','LEAD','NTILE','DENSE_RANK',
  'CAST','COALESCE','NULLIF','TRUE','FALSE','ASC','DESC','TOP','FETCH','NEXT','ROWS','ONLY',
  'EXPLAIN','ANALYZE','TRUNCATE','COMMIT','ROLLBACK','BEGIN','TRANSACTION',
  'PRIMARY','KEY','FOREIGN','REFERENCES','UNIQUE','DEFAULT','CHECK','CONSTRAINT',
  'RETURNING','USING','LATERAL','WINDOW','DATE','TIMESTAMP','INTERVAL',
  'VARCHAR','TEXT','INTEGER','INT','BIGINT','FLOAT','DOUBLE','DECIMAL','BOOLEAN','BOOL',
  'DATE_TRUNC','DATE_PART','EXTRACT','TO_DATE','TO_TIMESTAMP','NOW','CURRENT_DATE','CURRENT_TIMESTAMP',
]);

const PY_KW = new Set([
  'def','class','import','from','return','if','elif','else','for','while','in','not','and','or',
  'is','None','True','False','lambda','with','as','try','except','finally','raise','pass',
  'break','continue','yield','global','nonlocal','del','assert','async','await',
  'self','cls','super','print','range','len','type','isinstance','list','dict','set','tuple',
]);

const JS_KW = new Set([
  'const','let','var','function','return','if','else','for','while','do','switch','case','default',
  'class','extends','import','export','from','new','this','super','typeof','instanceof','in','of',
  'null','undefined','true','false','try','catch','finally','throw','async','await','yield',
  'delete','void','break','continue','interface','type','enum','implements','public','private',
  'protected','readonly','static','abstract','console','require','module','exports',
]);

const GD_KW = new Set([
  'func','var','const','class','class_name','extends','enum','signal','export','onready',
  'static','remote','master','puppet','slave','remotesync','mastersync','puppetsync',
  'if','elif','else','for','while','match','break','continue','return','pass',
  'and','or','not','in','is','as','null','true','false','self','tool','preload','load',
  'yield','await','super','new','PI','TAU','INF','NAN',
  'void','bool','int','float','String','Array','Dictionary','Vector2','Vector3','Vector4',
  'Color','Rect2','Transform2D','Transform3D','Basis','Quaternion','NodePath','Object',
  'Node','Node2D','Node3D','Resource','RefCounted','print','push_error','push_warning',
  'get_node','$','%',
]);

const CS_KW = new Set([
  'using','namespace','class','interface','struct','enum','delegate','event',
  'public','private','protected','internal','static','abstract','virtual','override','sealed',
  'readonly','const','new','this','base','null','true','false','default','typeof','sizeof',
  'void','bool','byte','sbyte','short','ushort','int','uint','long','ulong',
  'float','double','decimal','char','string','object','dynamic','var','let',
  'if','else','switch','case','for','foreach','while','do','break','continue','return',
  'try','catch','finally','throw','lock','checked','unchecked','unsafe','fixed',
  'async','await','yield','params','ref','out','in','is','as',
  'get','set','add','remove','value','partial','where','select','from','into','orderby',
  'ascending','descending','join','on','equals','group','by','let',
  'SerializeField','RequireComponent','Header','Tooltip','HideInInspector',
  'MonoBehaviour','Start','Update','Awake','OnEnable','OnDisable','OnDestroy',
  'Debug','GameObject','Transform','Vector2','Vector3','Quaternion','Color','Time',
  'Input','Physics','Rigidbody','Collider','Mathf','List','Dictionary','IEnumerator',
]);

function getKeywords(lang: CodeLanguage): Set<string> {
  if (lang === 'sql') return SQL_KW;
  if (lang === 'python') return PY_KW;
  if (lang === 'javascript' || lang === 'typescript') return JS_KW;
  if (lang === 'gdscript') return GD_KW;
  if (lang === 'csharp') return CS_KW;
  return new Set();
}

export function tokenizeLine(line: string, lang: CodeLanguage): Token[] {
  if (lang === 'text' || lang === 'json' || lang === 'bash') {
    return [{ text: line, type: 'plain' }];
  }

  const keywords = getKeywords(lang);
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    // Line comments
    if (lang === 'sql' && line[i] === '-' && line[i + 1] === '-') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      break;
    }
    if ((lang === 'python' || lang === 'gdscript') && line[i] === '#') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      break;
    }
    if ((lang === 'javascript' || lang === 'typescript' || lang === 'csharp') && line[i] === '/' && line[i + 1] === '/') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      break;
    }

    // String literals
    if (line[i] === '"' || line[i] === "'" || ((lang === 'javascript' || lang === 'typescript') && line[i] === '`')) {
      const quote = line[i];
      let j = i + 1;
      while (j < n && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      if (j < n) j++;
      tokens.push({ text: line.slice(i, j), type: 'string' });
      i = j;
      continue;
    }

    // Decorator/annotation (Python, GDScript @annotation, C# [Attribute])
    if ((lang === 'python' || lang === 'gdscript') && line[i] === '@') {
      let j = i + 1;
      while (j < n && /[\w.]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'decorator' });
      i = j;
      continue;
    }
    if (lang === 'csharp' && line[i] === '[') {
      let j = i + 1;
      while (j < n && line[j] !== ']') j++;
      if (j < n) j++;
      tokens.push({ text: line.slice(i, j), type: 'decorator' });
      i = j;
      continue;
    }

    // Number
    if (/[0-9]/.test(line[i])) {
      let j = i;
      while (j < n && /[\d._xXoObBa-fA-F]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'number' });
      i = j;
      continue;
    }

    // Word: keyword or identifier
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < n && /[\w]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const isKw = lang === 'sql' ? keywords.has(word.toUpperCase()) : keywords.has(word);
      const isFunc = !isKw && j < n && line[j] === '(';
      tokens.push({ text: word, type: isKw ? 'keyword' : isFunc ? 'function' : 'plain' });
      i = j;
      continue;
    }

    // Whitespace
    if (line[i] === ' ' || line[i] === '\t') {
      let j = i;
      while (j < n && (line[j] === ' ' || line[j] === '\t')) j++;
      tokens.push({ text: line.slice(i, j), type: 'plain' });
      i = j;
      continue;
    }

    // Single operator/punctuation char
    tokens.push({ text: line[i], type: 'operator' });
    i++;
  }

  return tokens;
}

export const TOKEN_COLORS: Record<TokenType, string> = {
  keyword:   '#79b8ff',
  string:    '#9ecbff',
  comment:   '#5a5a7a',
  number:    '#f97583',
  function:  '#b392f0',
  decorator: '#ffab70',
  operator:  '#e1e4e8',
  plain:     '#c9d1d9',
};
