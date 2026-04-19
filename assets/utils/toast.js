/* Cabinet — toast notification dispatcher
 * Replaces direct DOM manipulation with a CustomEvent that the
 * cabToast Alpine component (components/toast.js) catches reactively.
 */

function showToast(message, type='success') {
  window.dispatchEvent(new CustomEvent('cab:toast', {detail: {message, type}}));
}
