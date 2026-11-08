class MonBadge extends HTMLElement {
  set etiquette(valeur) {
    this.textContent = `Web component : ${valeur}`;
  }
}
customElements.define('mon-badge', MonBadge);
