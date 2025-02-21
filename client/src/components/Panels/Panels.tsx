import { lazy, Suspense } from "react";
import styled from "styled-components";

import Loading from "../Loading";
import Side from "./Side";
import Noti from "./Noti";

const Main = lazy(() => import("./Main"));
const Bottom = lazy(() => import("./Bottom"));

const Panels = () => (
  <Wrapper>
    <Noti />
    <MainWrapper>
      <Side />
      <Suspense fallback={<Loading size={10} circleCount={10} />}>
        <Main />
      </Suspense>
    </MainWrapper>
    <Suspense fallback={false}>
      <Bottom />
    </Suspense>
  </Wrapper>
);

const Wrapper = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
`;

const MainWrapper = styled.div`
  display: grid;
  grid-template-columns: 23fr 97fr;
  overflow: hidden;
  width: 100%;
  flex: 1;
`;

export default Panels;
