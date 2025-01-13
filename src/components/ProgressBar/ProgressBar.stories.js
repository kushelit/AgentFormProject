import { ProgressBar } from ".";

export default {
  title: "Components/ProgressBar",
  component: ProgressBar,

  argTypes: {
    state: {
      options: [
        "low",
        "didn-t-start",
        "high",
        "complete",
        "time",
        "progress",
        "error",
      ],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    graff: true,
    prop: true,
    state: "low",
    className: {},
  },
};
