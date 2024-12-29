import { PaginationArrows } from ".";

export default {
  title: "Components/PaginationArrows",
  component: PaginationArrows,

  argTypes: {
    type: {
      options: ["back", "next"],
      control: { type: "select" },
    },
    state: {
      options: ["disabled", "hover", "selected", "default"],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    type: "back",
    state: "disabled",
    className: {},
  },
};
