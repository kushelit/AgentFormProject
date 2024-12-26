import { ToastNotification } from ".";

export default {
  title: "Components/ToastNotification",
  component: ToastNotification,

  argTypes: {
    type: {
      options: ["warning", "success", "error"],
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
