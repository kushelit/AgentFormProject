import { Dialog } from ".";

export default {
  title: "Components/Dialog",
  component: Dialog,

  argTypes: {
    type: {
      options: ["warning", "success", "error", "info"],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    type: "warning",
    className: {},
  },
};
