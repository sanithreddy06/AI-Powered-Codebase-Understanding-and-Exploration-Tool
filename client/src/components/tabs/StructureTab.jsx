import { useMemo, useState } from 'react'

function groupByFolder(filesIndex) {
  const root = { name: '', children: {}, files: [] }
  for (const f of filesIndex) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      if (isLast) {
        node.files.push(f)
      } else {
        node.children[part] = node.children[part] || { name: part, children: {}, files: [] }
        node = node.children[part]
      }
    }
  }
  return root
}

function FolderNode({ node, level = 0 }) {
  const [open, setOpen] = useState(level < 2)
  const childFolders = Object.values(node.children || {}).sort((a, b) => a.name.localeCompare(b.name))
  const files = (node.files || []).sort((a, b) => a.path.localeCompare(b.path))

  return (
    <div className="tree-node" style={{ marginLeft: level * 10 }}>
      {node.name && (
        <button className="tree-folder" type="button" onClick={() => setOpen(!open)}>
          <span className="caret">{open ? '▾' : '▸'}</span>
          <span className="folder-name">{node.name}</span>
          <span className="folder-meta">{childFolders.length} folders · {files.length} files</span>
        </button>
      )}

      {open && (
        <div className="tree-children">
          {childFolders.map((c) => (
            <FolderNode key={`${node.name}/${c.name}`} node={c} level={node.name ? level + 1 : level} />
          ))}
          {files.map((f) => (
            <div key={f.path} className="tree-file">
              <span className="mono">{f.path.split('/').pop()}</span>
              <span className="file-meta">
                {f.ext} · {f.functionCount || 0} fn · {f.classCount || 0} cls
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StructureTab({ data }) {
  const [filter, setFilter] = useState('')

  const filesIndex = data?.filesIndex || []

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return filesIndex
    return filesIndex.filter((f) => f.path.toLowerCase().includes(q))
  }, [filesIndex, filter])

  const tree = useMemo(() => groupByFolder(filtered), [filtered])

  if (!data) {
    return <div className="explorer-empty">Analyze a project to see file structure.</div>
  }

  return (
    <div className="tab-page">
      <div className="card">
        <h3>All Files</h3>
        <input
          className="sidebar-input"
          placeholder="Filter files (e.g. utils, auth, test...)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div style={{ marginTop: '12px' }}>
          <FolderNode node={tree} />
        </div>
      </div>
    </div>
  )
}

