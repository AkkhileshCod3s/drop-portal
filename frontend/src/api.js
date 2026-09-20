// API layer: all calls to the Flask backend, plus the upload helper.
// JSON errors carry the server's `error` message and keep the HTTP status so
// pages can distinguish 404 (not found / expired) from 410 (already used).

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('network error', 0)
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    // non-JSON response body; fall through with empty data
  }
  if (!res.ok) {
    throw new ApiError(data.error || `request failed (${res.status})`, res.status)
  }
  return data
}

export function createDrop(files, options) {
  return request('POST', '/api/drops', {
    files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    ...options,
  })
}

export function getDrop(slug) {
  return request('GET', `/api/drops/${encodeURIComponent(slug)}`)
}

export function downloadDrop(slug, password) {
  return request('POST', `/api/drops/${encodeURIComponent(slug)}/download`, password ? { password } : {})
}

export function deleteDrop(slug, token) {
  return request('DELETE', `/api/drops/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`)
}

// PUT each file straight to its presigned URL with XMLHttpRequest, because
// fetch cannot report upload progress. Reports combined progress 0-100
// across all files through onProgress.
export function uploadAll(files, uploads, onProgress) {
  return new Promise((resolve, reject) => {
    const total = files.reduce((sum, f) => sum + f.size, 0) || 1
    const loaded = files.map(() => 0)
    let settled = false
    let failures = 0

    const report = () => {
      const done = loaded.reduce((a, b) => a + b, 0)
      onProgress(Math.min(100, Math.round((done / total) * 100)))
    }

    const finish = () => {
      if (settled) return
      settled = true
      if (failures === 0) resolve()
    }

    if (files.length === 0) {
      resolve()
      return
    }

    files.forEach((file, i) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploads[i].url)
      // Send the exact same Content-Type that was signed on the server.
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          loaded[i] = e.loaded
          report()
        }
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          loaded[i] = file.size
          report()
        } else {
          failures += 1
          reject(new ApiError(`upload failed (${xhr.status})`, xhr.status))
        }
        finish()
      })
      xhr.addEventListener('error', () => {
        failures += 1
        reject(new ApiError('network error during upload', 0))
      })
      xhr.addEventListener('abort', () => {
        failures += 1
        reject(new ApiError('upload cancelled', 0))
      })
      xhr.send(file)
    })
  })
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(1)
  return `${text} ${units[unit]}`
}
