import { DialogHeader } from ".";

export default {
  title: "Components/DialogHeader",
  component: DialogHeader,

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
