import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { HomeScreen } from "./features/home/HomeScreen";
import { FanoutScreen } from "./features/fanout/FanoutScreen";
import { DirectScreen } from "./features/direct/DirectScreen";
import { TopicScreen } from "./features/topic/TopicScreen";
import { HeadersScreen } from "./features/headers/HeadersScreen";
import { DefaultScreen } from "./features/default/DefaultScreen";
import { ExchangeToExchangeScreen } from "./features/exchange-to-exchange/ExchangeToExchangeScreen";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/fanout" element={<FanoutScreen />} />
          <Route path="/direct" element={<DirectScreen />} />
          <Route path="/topic" element={<TopicScreen />} />
          <Route path="/headers" element={<HeadersScreen />} />
          <Route path="/default" element={<DefaultScreen />} />
          <Route path="/exchange-to-exchange" element={<ExchangeToExchangeScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
