import type { Part } from "../model/project";
export type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";
export interface PathNode {
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
}
export interface NodePath {
  closed: boolean;
  nodes: PathNode[];
}
export type GeometryJob =
  | { type: "boolean"; parts: Part[]; operation: BooleanOperation }
  | { type: "inspect"; parts: Part[] }
  | { type: "addPoint"; parts: Part[]; path: number; node: number }
  | {
      type: "insertPoint";
      parts: Part[];
      x: number;
      y: number;
      tolerance: number;
    }
  | { type: "removePoint"; parts: Part[]; path: number; node: number }
  | {
      type: "slice";
      parts: Part[];
      x: number;
      y: number;
      x2: number;
      y2: number;
    }
  | { type: "cut"; parts: Part[]; x: number; y: number; tolerance: number }
  | {
      type: "node";
      parts: Part[];
      path: number;
      node: number;
      value: PathNode;
      mode?: "corner" | "smooth";
    };
export interface GeometryResult {
  pathData: string;
  paths: NodePath[];
  area: number;
  space: "world" | "local";
  cutPaths?: [string, string];
  selectedNode?: { path: number; node: number };
}
