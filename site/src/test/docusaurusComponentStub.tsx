import React from 'react';

type ComponentStubProps = {
  children?: React.ReactNode;
};

export default function DocusaurusComponentStub({
  children,
}: ComponentStubProps): React.ReactElement {
  return <>{children}</>;
}
