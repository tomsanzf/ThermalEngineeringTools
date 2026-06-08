/* ==========================================================================
   Thermal Engineering Portal - Client Interactivity
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.tool-card');

  cards.forEach(card => {
    // 1. Mouse Move Spotlight Effect
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left; // x position within the element.
      const y = e.clientY - rect.top;  // y position within the element.

      // Update CSS variables for dynamic spotlight positioning
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });

    // 2. Subtle 3D Tilt Effect on Hover
    card.addEventListener('mouseenter', () => {
      card.style.transition = 'transform 0.1s ease, border-color 0.4s ease';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.4s ease';
      card.style.transform = 'translateY(0) rotateX(0deg) rotateY(0deg)';
      card.style.removeProperty('--mouse-x');
      card.style.removeProperty('--mouse-y');
    });
  });

  // Log portal initialized successfully
  console.log('Thermal Engineering Portal loaded successfully. Welcome, Engineer.');
});
