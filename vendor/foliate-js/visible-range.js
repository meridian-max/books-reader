// Books: reuse measured sibling bounds while the chapter layout is unchanged.
// The first lookup does the same linear measurement as the original walker.
// Later lookups search monotonic bounds; unusual/reordered layouts use the
// original complete traversal. Nodes and CFI offsets are never changed.
export class VisibleRangeIndex {
    // Retain only indexed parents, not a JS wrapper/object for every sibling.
    // Child indexes and full-precision bounds live in compact numeric arrays.
    #parents = new Map()
    #observer
    constructor(doc) {
        this.#observer = new MutationObserver(() => this.invalidate())
        this.#observer.observe(doc.documentElement, {
            subtree: true, childList: true, attributes: true, characterData: true,
        })
    }
    invalidate() {
        this.#parents.clear()
    }
    prepare() {
        if (this.#observer.takeRecords().length) this.invalidate()
    }
    children(parent, start, end, mapRect) {
        if (parent.childNodes.length < 64) return parent.childNodes
        let indexed = this.#parents.get(parent)
        if (!indexed) {
            const length = parent.childNodes.length
            const positions = new Uint32Array(length)
            const starts = new Float64Array(length)
            const ends = new Float64Array(length)
            let count = 0
            let monotonic = true, previousStart = -Infinity, previousEnd = -Infinity
            for (let i = 0; i < length; i++) {
                const node = parent.childNodes[i]
                let rect
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (['script', 'style'].includes(node.localName?.toLowerCase())) {
                        continue
                    }
                    rect = node.getBoundingClientRect()
                } else if ((node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) && node.nodeValue.trim()) {
                    const range = node.ownerDocument.createRange()
                    range.selectNodeContents(node)
                    rect = range.getBoundingClientRect()
                } else {
                    continue
                }
                const { left, right } = mapRect(rect)
                if (!Number.isFinite(left) || !Number.isFinite(right) || left < previousStart || right < previousEnd) {
                    monotonic = false
                    break
                }
                positions[count] = i
                starts[count] = left
                ends[count] = right
                count++
                previousStart = left
                previousEnd = right
            }
            // Filter only nodes the original walker could accept. This leaves
            // their document order unchanged, including inline text chunks.
            indexed = monotonic ? { positions, starts, ends, count, monotonic } : { monotonic }
            this.#parents.set(parent, indexed)
        }
        if (!indexed.monotonic) return parent.childNodes
        const { positions, starts, ends, count } = indexed
        let lo = 0, hi = count
        while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (ends[mid] < start) lo = mid + 1
            else hi = mid
        }
        const first = lo
        hi = count
        while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (starts[mid] <= end) lo = mid + 1
            else hi = mid
        }
        const nodes = []
        for (let i = first; i < lo; i++) nodes.push(parent.childNodes[positions[i]])
        return nodes
    }
    destroy() {
        this.#observer.disconnect()
        this.invalidate()
    }
}
