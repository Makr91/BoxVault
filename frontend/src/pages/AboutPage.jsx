import PropTypes from 'prop-types';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaBook,
  FaChevronRight,
  FaCircleCheck,
  FaCubes,
  FaHeart,
  FaRocket,
  FaStar,
} from 'react-icons/fa6';

const linkShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  href: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  Icon: PropTypes.elementType.isRequired,
  tone: PropTypes.string,
});

const SectionTitle = ({ Icon, children }) => (
  <h2 className="h5 d-flex align-items-center gap-2 mb-3">
    <Icon className="text-primary" aria-hidden />
    {children}
  </h2>
);

SectionTitle.propTypes = {
  Icon: PropTypes.elementType.isRequired,
  children: PropTypes.node.isRequired,
};

/**
 * The About page every estate app draws the same way: a hero with the
 * brand, title, version pill, the documentation links and the optional
 * favourite toggle, the goal as a quote beside it, features as a check
 * grid, documentation as a list, components as headed cards and the
 * support links as a footer strip. The app supplies only its content.
 */
const AboutPage = ({
  brand,
  title,
  description,
  version,
  goal,
  features,
  components,
  docs,
  docsIntro,
  support,
  supportIntro,
  favorite = null,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="container py-3">
      <section className="row align-items-center g-4 mb-5">
        <div className="col-lg-7">
          <div className="d-flex align-items-center gap-3 mb-3">
            {brand}
            <h1 className="display-6 fw-bold mb-0">{title}</h1>
          </div>
          <p className="lead text-body-secondary">{description}</p>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="badge rounded-pill text-bg-primary fs-6 fw-semibold">v{version}</span>
            {docs.map(({ key, href, label, Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2"
              >
                <Icon aria-hidden />
                {label}
              </a>
            ))}
            {favorite ? (
              <button
                type="button"
                className={`btn btn-sm ${favorite.active ? 'btn-warning' : 'btn-outline-warning'} d-inline-flex align-items-center gap-2`}
                onClick={favorite.onToggle}
              >
                <FaStar aria-hidden />
                {favorite.active
                  ? t('pages.about.removeFromFavorites')
                  : t('pages.about.addToFavorites')}
              </button>
            ) : null}
          </div>
          {favorite?.message ? (
            <div className="alert alert-info mt-3 mb-0 py-2">{favorite.message}</div>
          ) : null}
        </div>
        <div className="col-lg-5">
          <figure className="p-4 rounded-3 border bg-body-tertiary mb-0">
            <blockquote className="blockquote mb-0 fs-5 fst-italic">{goal}</blockquote>
          </figure>
        </div>
      </section>

      <section className="mb-5">
        <SectionTitle Icon={FaRocket}>{t('pages.about.keyFeatures')}</SectionTitle>
        <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
          {features.map(feature => (
            <div key={feature} className="col">
              <div className="d-flex align-items-start gap-2 p-3 h-100 rounded-3 border bg-body">
                <FaCircleCheck className="text-success flex-shrink-0 mt-1" aria-hidden />
                <span>{feature}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="row g-4 mb-5">
        <div className="col-lg-6">
          <SectionTitle Icon={FaBook}>{t('pages.about.documentation')}</SectionTitle>
          <p className="text-body-secondary">{docsIntro}</p>
          <div className="list-group shadow-sm">
            {docs.map(({ key, href, label, Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3"
              >
                <Icon className="text-primary fs-5 flex-shrink-0" aria-hidden />
                <span className="flex-grow-1">{label}</span>
                <FaChevronRight className="text-body-secondary small" aria-hidden />
              </a>
            ))}
          </div>
        </div>
        <div className="col-lg-6">
          <SectionTitle Icon={FaCubes}>{t('pages.about.components')}</SectionTitle>
          <div className="row row-cols-1 row-cols-sm-2 g-3">
            {components.map(component => (
              <div key={component.title} className="col">
                <div className="p-3 h-100 rounded-3 border bg-body">
                  <h3 className="h6 fw-bold mb-2">{component.title}</h3>
                  <ul className="list-unstyled mb-0 small">
                    {component.details.map(detail => (
                      <li key={detail} className="d-flex align-items-start gap-2 mb-1">
                        <FaChevronRight className="text-primary mt-1 flex-shrink-0" aria-hidden />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-top pt-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <div className="fw-semibold d-flex align-items-center gap-2">
            <FaHeart className="text-danger" aria-hidden />
            {t('pages.about.support')}
          </div>
          <div className="text-body-secondary small">{supportIntro}</div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {support.map(({ key, href, label, Icon, tone = 'secondary' }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-sm btn-outline-${tone} d-inline-flex align-items-center gap-2`}
            >
              <Icon aria-hidden />
              {label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
};

AboutPage.propTypes = {
  brand: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  version: PropTypes.string.isRequired,
  goal: PropTypes.string.isRequired,
  features: PropTypes.arrayOf(PropTypes.string).isRequired,
  components: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      details: PropTypes.arrayOf(PropTypes.string).isRequired,
    })
  ).isRequired,
  docs: PropTypes.arrayOf(linkShape).isRequired,
  docsIntro: PropTypes.string.isRequired,
  support: PropTypes.arrayOf(linkShape).isRequired,
  supportIntro: PropTypes.string.isRequired,
  favorite: PropTypes.shape({
    active: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired,
    message: PropTypes.string,
  }),
};

export default AboutPage;
