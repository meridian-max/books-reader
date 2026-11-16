// Books: controls and nested overflow regions keep their native gestures.
// Inspired by readest/foliate-js's input-ownership guard; MIT engine license.
export const ownsScrollInput = (target, horizontal, boundary = target?.ownerDocument?.body) => {
    const element = target?.nodeType === 1 ? target : target?.parentElement
    if (element?.closest('a,button,input,textarea,select,audio,video,[contenteditable]:not([contenteditable="false"])'))
        return true
    const doc = element?.ownerDocument
    for (let node = element; node && node !== boundary && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
        const style = doc.defaultView.getComputedStyle(node)
        const overflow = horizontal ? style.overflowX : style.overflowY
        const size = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight
        if (size > 1 && /^(auto|scroll|overlay)$/.test(overflow)) return true
    }
    return false
}
