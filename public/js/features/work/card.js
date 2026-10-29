import { icons } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';

const LOCAL_PROJECTS = ['rainbow-orchard', 'cat-battle', 'cosmic-egg', 'dragon-escape', 'orchard-upgrade'];

/**
 * Pure template generator rendering a responsive 16:9 portfolio project card.
 * @param {object} project - Project data record
 * @param {number} [index=0] - Card index used for eager/lazy loading decision
 * @returns {string} HTML string representing the card anchor element
 */
export function renderProjectCard(project, index = 0) {
  if (!project) return '';

  const isEager = index < 3;
  const isLocal = LOCAL_PROJECTS.some((n) => project.image === `/assets/${n}.webp`);
  const srcSet = isLocal ? `srcset="${project.image.replace('.webp', '-small.webp')} 800w, ${project.image} 1600w"` : '';

  const categoryLabel = project.category === 'Thumbnails'
    ? 'Game thumbnail'
    : project.category === 'Trailers'
      ? 'Game trailer'
      : 'Creative campaign';

  return `
    <a class="project-card" href="/work/${escapeHtml(project.slug)}" data-category="${escapeHtml(project.category)}">
      <div class="project-cover">
        <img src="${escapeHtml(project.image)}" ${srcSet} sizes="(max-width: 650px) 100vw, (max-width: 950px) 50vw, 33vw" alt="${escapeHtml(project.title)} — ${escapeHtml(project.category ? project.category.toLowerCase() : '')} creative" width="1600" height="900" loading="${isEager ? 'eager' : 'lazy'}" decoding="async" />
        <span class="project-view">${icons.arrowUpRight(22)}</span>
        ${project.video ? `<span class="video-label">${icons.play(12)} Watch trailer</span>` : ''}
        ${project.concept ? `<span class="concept-label">CONCEPT</span>` : ''}
      </div>
      <div class="project-meta">
        <div>
          <h3>${escapeHtml(project.title)}</h3>
          <p>${categoryLabel}</p>
        </div>
        ${icons.arrowUpRight(21)}
      </div>
    </a>
  `;
}
