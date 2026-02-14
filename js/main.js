const heroVideo = document.querySelector(".hero__video");
const revealEls = document.querySelectorAll(".card, .section__head");

for (const el of revealEls) {
  el.setAttribute("data-reveal", "");
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.2 }
);

for (const el of revealEls) {
  revealObserver.observe(el);
}

const updateHeroParallax = () => {
  if (!heroVideo) return;
  const scrollY = window.scrollY || 0;
  const max = window.innerHeight;
  const progress = Math.min(1, scrollY / max);
  const scale = 1.03 + progress * 0.1;
  const y = progress * 22;
  heroVideo.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
};

updateHeroParallax();
window.addEventListener("scroll", updateHeroParallax, { passive: true });
