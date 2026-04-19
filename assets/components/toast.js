/* Cabinet — Toast notification component
 * Listens to 'cab:toast' CustomEvents dispatched by showToast() (utils/toast.js).
 * Usage in template: <div x-data="cabToast" ...>
 */

function cabToast() {
  return {
    toasts: [],

    init() {
      window.addEventListener('cab:toast', ({detail}) => {
        const id = Date.now() + Math.random();
        this.toasts.push({id, message: detail.message, type: detail.type || 'success'});
        setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 2800);
      });
    },
  };
}
