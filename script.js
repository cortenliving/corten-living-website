const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}
document.querySelectorAll('.current-year').forEach(el => el.textContent = new Date().getFullYear());

document.querySelectorAll('.contact-form').forEach(form => {
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const name = data.get('name') || '';
    const email = data.get('email') || '';
    const phone = data.get('phone') || '';
    const category = data.get('category') || '';
    const message = data.get('message') || '';
    const subject = encodeURIComponent(`Corten Living enquiry from ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nProduct / project: ${category}\n\n${message}`);
    window.location.href = `mailto:cortenliving@gmail.com?subject=${subject}&body=${body}`;
  });
});
