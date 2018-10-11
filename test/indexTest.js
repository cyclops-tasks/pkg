import dotEvent from "dot-event"
import dotStore from "dot-store"
import pkg from "../dist/pkg"

let events, store

beforeEach(async () => {
  events = dotEvent()
  store = dotStore(events)

  pkg({ events, store })

  await store.set("argv", { _: ["pkg"], all: true })

  const spawn = {
    gitBehind: { out: "" },
    gitDirty: { code: 0 },
  }

  await store.set("taskCount", 2)

  await store.set("tasks.project-a", {
    projectPath: `${__dirname}/fixture/project-a`,
    projectPkgPath: `${__dirname}/fixture/project-a/package.json`,
    taskId: "project-a",
    taskIndex: 0,
    taskLeader: true,
  })

  await store.set("tasks.project-b", {
    projectPath: `${__dirname}/fixture/project-b`,
    projectPkgPath: `${__dirname}/fixture/project-b/package.json`,
    taskId: "project-b",
    taskIndex: 0,
  })

  await store.set("spawn.project-a", spawn)
  await store.set("spawn.project-b", spawn)

  events.onAny("before.spawn", ({ event }) => {
    event.signal.cancel = true
  })
})

async function run(option = "all") {
  await store.set("argv", {
    _: ["pkg"],
    [option]: true,
  })

  await Promise.all([
    events.emit("startTask", { taskId: "project-a" }),
    events.emit("startTask", { taskId: "project-b" }),
  ])
}

describe("all", () => {
  test("waits for all steps", async () => {
    await run()

    expect(store.state.phase).toEqual({
      "Bump publish versions": 2,
      "Find highest versions": 2,
      "Match versions and install": 2,
      "Match versions and publish": 2,
      "Read package json": 2,
    })
  })
})

describe("match", () => {
  test("upgrades shared package to highest version", async () => {
    const args = []

    events.on("emit.writeJson", ({ event }) => {
      args.push(event.args[0].json)
    })

    await run("match")

    expect(args).toContainEqual({
      dependencies: { shared: "0.0.2" },
      name: "project-a",
      version: "0.0.1",
    })

    expect(args).toContainEqual({
      dependencies: {
        "project-a": "0.0.1",
        shared: "0.0.2",
      },
      name: "project-b",
      version: "0.0.1",
    })
  })

  test("spawns npm install", async () => {
    const spawns = []

    events.onAny("before.spawn", ({ event }) => {
      spawns.push(event.args)
    })

    await run("match")

    expect(spawns).toContainEqual([
      "npm",
      "install",
      { cwd: `${__dirname}/fixture/project-a` },
    ])

    expect(spawns).toContainEqual([
      "npm",
      "install",
      { cwd: `${__dirname}/fixture/project-b` },
    ])
  })
})

describe("publish", () => {
  test("bumps versions", async () => {
    const args = []

    events.on("emit.writeJson", ({ event }) =>
      args.push(event.args[0].json)
    )

    await run("publish")

    expect(args).toContainEqual({
      dependencies: { shared: "0.0.2" },
      name: "project-a",
      version: "0.0.2",
    })

    expect(args).toContainEqual({
      dependencies: {
        "project-a": "0.0.2",
        shared: "0.0.1",
      },
      name: "project-b",
      version: "0.0.2",
    })
  })
})
