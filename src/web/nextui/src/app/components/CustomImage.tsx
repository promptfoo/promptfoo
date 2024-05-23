import Image from 'next/image';
import React from 'react';

interface CustomImageProps {
  src: string;
  alt: string;
  title?: string;
}

const CustomImage: React.FC<CustomImageProps> = ({ src, alt, title }) => {
  const width = 400;
  return (
    <Image
      src={src}
      alt={alt}
      title={title}
      width={width}
      style={{ maxWidth: '100%', height: 'auto' }} // Ensure responsiveness
    />
  );
};

export default CustomImage;
