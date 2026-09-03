import PropTypes from 'prop-types';
import { FaCircleUser } from 'react-icons/fa6';

const Avatar = ({ picture = '', size, fallback = null }) =>
  picture ? (
    <img src={picture} alt="" width={size} height={size} className="rounded-circle flex-shrink-0" />
  ) : (
    fallback || <FaCircleUser size={size} className="flex-shrink-0" aria-hidden />
  );

Avatar.propTypes = {
  picture: PropTypes.string,
  size: PropTypes.number.isRequired,
  fallback: PropTypes.node,
};

export default Avatar;
