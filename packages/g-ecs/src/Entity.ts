import { inject, injectable } from 'inversify';
import { ComponentConstructor, Component } from './Component';
import { EntityManager } from './EntityManager';
import { ILifecycle } from './ObjectPool';

/**
 * A bag of components
 * @see https://github.com/mzaks/EntitasCookBook/blob/master/chapters/1_ingredients/102_entity.md
 */
@injectable()
export class Entity implements ILifecycle {
  /**
   * A unique ID for this entity.
   */
  protected id: number;

  /**
   * Whether or not the entity is alive or removed.
   */
  protected alive: boolean;

  protected name: string;

  protected components: Record<string, Component> = {};
  protected componentsToRemove: Record<string, Component> = {};

  @inject(EntityManager)
  private entityManager: EntityManager;

  public getComponents(): Record<string, Component> {
    return this.components;
  }

  public getComponentsToRemove(): Record<string, Component> {
    return this.componentsToRemove;
  }

  public setAlive(alive: boolean) {
    this.alive = alive;
  }

  public setName(name: string) {
    this.name = name;
  }

  public getName() {
    return this.name;
  }

  public getComponent<C extends Component>(clazz: ComponentConstructor<C>, includeRemoved = false): C {
    let component = this.components[clazz.tag];
    if (!component && includeRemoved) {
      component = this.componentsToRemove[clazz.tag];
    }
    return component as C;
  }

  public hasComponent<C extends Component>(clazz: ComponentConstructor<C>, includeRemoved = false) {
    return (
      !!~Object.keys(this.components).indexOf(clazz.tag) || (includeRemoved === true && this.hasRemovedComponent(clazz))
    );
  }

  public hasRemovedComponent<C extends Component>(clazz: ComponentConstructor<C>) {
    return !!~Object.keys(this.componentsToRemove).indexOf(clazz.tag);
  }

  public hasAllComponents<C extends Component>(clazzes: ComponentConstructor<C>[]) {
    return clazzes.every((clazz) => this.hasComponent(clazz));
  }

  public hasAnyComponents<C extends Component>(clazzes: ComponentConstructor<C>[]) {
    return clazzes.some((clazz) => this.hasComponent(clazz));
  }

  public addComponent<C extends Component>(
    clazz: ComponentConstructor<C>,
    values?: Partial<Omit<C, keyof Component>>
  ): C {
    return this.entityManager.addComponentToEntity(this, clazz, values);
  }

  public removeComponent<C extends Component>(clazz: ComponentConstructor<C>, forceImmediate = false) {
    this.entityManager.removeComponentFromEntity(this, clazz, forceImmediate);
    return this;
  }

  public removeAllComponents() {
    return this;
  }

  public reset() {}

  public cast<C extends Component>(
    component: Component | undefined | null,
    componentClass: ComponentConstructor<C>
  ): component is C {
    return !!(component && component instanceof componentClass);
  }
}
