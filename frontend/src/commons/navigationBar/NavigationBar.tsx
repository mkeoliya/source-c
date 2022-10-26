import { Alignment, Classes, Icon, Navbar, NavbarDivider, NavbarGroup } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import classNames from 'classnames';
import * as React from 'react';
import { NavLink } from 'react-router-dom';

import { Role } from '../application/ApplicationTypes';

type NavigationBarProps = DispatchProps & StateProps;

type DispatchProps = {};

type StateProps = {
  role?: Role;
  title: string;
  name?: string;
};

const NavigationBar: React.SFC<NavigationBarProps> = props => (
  <Navbar className={classNames('NavigationBar', 'primary-navbar', Classes.DARK)}>
    <NavbarGroup align={Alignment.LEFT}>
      <NavLink
        activeClassName={Classes.ACTIVE}
        className={classNames('NavigationBar__link', Classes.BUTTON, Classes.MINIMAL)}
        to="/playground"
      >
        <Icon icon={IconNames.CODE} />
        <div className="navbar-button-text hidden-xs">{'Source Academy Playground'}</div>
      </NavLink>
      {props.role && (
        <NavLink
          activeClassName={Classes.ACTIVE}
          className={classNames('NavigationBar__link', Classes.BUTTON, Classes.MINIMAL)}
          to="/achievement"
        >
          <Icon icon={IconNames.MOUNTAIN} />
          <div className="navbar-button-text hidden-xs">Achievement</div>
        </NavLink>
      )}
    </NavbarGroup>

    <NavbarGroup align={Alignment.RIGHT}>
      <NavLink
        activeClassName={Classes.ACTIVE}
        className={classNames('NavigationBar__link', Classes.BUTTON, Classes.MINIMAL)}
        to="/contributors"
      >
        <Icon icon={IconNames.HEART} />
        <div className="navbar-button-text hidden-xs">Contributors</div>
      </NavLink>

      <div className="visible-xs">
        <NavbarDivider className="thin-divider" />
      </div>
      <div className="hidden-xs">
        <NavbarDivider className="default-divider" />
      </div>
    </NavbarGroup>
  </Navbar>
);

export default NavigationBar;
