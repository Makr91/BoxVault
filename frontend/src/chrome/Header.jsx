import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FaCircleHalfStroke, FaMoon, FaSun } from 'react-icons/fa6';

import Crumbs, { crumbShape } from './Crumbs';
import { LanguageButton } from './LanguageModal';
import { NavbarSearchControl, NavbarSearchPanel } from './NavbarSearch';
import SessionEndedBanner from './SessionEndedBanner';
import UserMenu, { SignInButton } from './UserMenu';

const THEME_ICONS = { auto: FaCircleHalfStroke, light: FaSun, dark: FaMoon };

const Brand = ({ brand, LinkComponent }) => {
  const className = 'navbar-brand p-0 d-flex align-items-center';
  if (brand.to) {
    return (
      <LinkComponent to={brand.to} className={className}>
        {brand.logo}
        {brand.name}
      </LinkComponent>
    );
  }
  return (
    <a
      href={brand.href || '/'}
      className={className}
      onClick={
        brand.onClick
          ? event => {
              event.preventDefault();
              brand.onClick();
            }
          : undefined
      }
    >
      {brand.logo}
      {brand.name}
    </a>
  );
};

export const brandShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  logo: PropTypes.node.isRequired,
  href: PropTypes.string,
  to: PropTypes.string,
  onClick: PropTypes.func,
});

Brand.propTypes = {
  brand: brandShape.isRequired,
  LinkComponent: PropTypes.elementType.isRequired,
};

const UtilityLinks = ({ links, LinkComponent }) =>
  links.map(link => (
    <li key={link.key} className="nav-item">
      {link.to ? (
        <LinkComponent to={link.to} className="nav-link">
          {link.label}
        </LinkComponent>
      ) : (
        <a href={link.href} className="nav-link">
          {link.label}
        </a>
      )}
    </li>
  ));

export const linkShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  href: PropTypes.string,
  to: PropTypes.string,
});

UtilityLinks.propTypes = {
  links: PropTypes.arrayOf(linkShape).isRequired,
  LinkComponent: PropTypes.elementType.isRequired,
};

const Header = ({
  brand,
  links = [],
  crumbs = [],
  LinkComponent = 'a',
  theme,
  language,
  signedIn,
  onSignIn = null,
  signInTo = '',
  userMenu = null,
  sessionEnded = false,
}) => {
  const { t } = useTranslation();
  const ThemeIcon = THEME_ICONS[theme.preference] || FaCircleHalfStroke;
  const themeLabel = t(`theme.${theme.preference}`);

  return (
    <nav className="navbar navbar-expand-lg shadow-sm bg-body-tertiary border-bottom">
      <div className="container-fluid">
        <Brand brand={brand} LinkComponent={LinkComponent} />
        <ul className="nav nav-pills me-auto align-items-center">
          {signedIn ? (
            <Crumbs crumbs={crumbs} LinkComponent={LinkComponent} />
          ) : (
            <UtilityLinks links={links} LinkComponent={LinkComponent} />
          )}
        </ul>

        <ul className="nav nav-pills ms-auto align-items-center">
          <NavbarSearchControl />
          <li className="nav-item">
            <button
              key={theme.preference}
              type="button"
              className="btn btn-link nav-link cluster-btn"
              onClick={theme.onToggle}
              title={themeLabel}
              aria-label={themeLabel}
            >
              <ThemeIcon />
            </button>
          </li>
          <LanguageButton languages={language.languages} onPick={language.onPick} />
          {signedIn && userMenu ? (
            <UserMenu {...userMenu} />
          ) : (
            <SignInButton onSignIn={onSignIn} signInTo={signInTo} LinkComponent={LinkComponent} />
          )}
        </ul>
      </div>
      {sessionEnded ? <SessionEndedBanner /> : null}
      <NavbarSearchPanel />
    </nav>
  );
};

Header.propTypes = {
  brand: brandShape.isRequired,
  links: PropTypes.arrayOf(linkShape),
  crumbs: PropTypes.arrayOf(crumbShape),
  LinkComponent: PropTypes.elementType,
  theme: PropTypes.shape({
    preference: PropTypes.string.isRequired,
    onToggle: PropTypes.func.isRequired,
  }).isRequired,
  language: PropTypes.shape({
    languages: PropTypes.arrayOf(PropTypes.string).isRequired,
    onPick: PropTypes.func.isRequired,
  }).isRequired,
  signedIn: PropTypes.bool.isRequired,
  onSignIn: PropTypes.func,
  signInTo: PropTypes.string,
  userMenu: PropTypes.object,
  sessionEnded: PropTypes.bool,
};

export default Header;
