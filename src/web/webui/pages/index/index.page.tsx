import EvaluateTestSuiteCreator from './EvaluateTestSuiteCreator';

export { Page };

function Page() {
  return (
    <>
      <EvaluateTestSuiteCreator
        onSubmit={() => {
          alert('yolo');
        }}
      />
    </>
  );
}
