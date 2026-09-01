import EventBus from "../common/EventBus";

export const endSession = () => {
  const returnTo = window.location.pathname + window.location.search;
  localStorage.removeItem("user");
  EventBus.dispatch("sessionEnded", { returnTo });
};
