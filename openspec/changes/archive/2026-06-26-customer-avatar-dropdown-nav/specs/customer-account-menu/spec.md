## ADDED Requirements

### Requirement: Profile menu trigger shows an initials avatar when signed in

The header profile-menu trigger SHALL display an initials avatar — a circular
element containing the signed-in customer's initials on a deterministic
background color — whenever a customer is authenticated and a name or email is
available. The initials and color SHALL be derived purely from the customer's
name (falling back to email), with no profile image required. The same
customer SHALL always receive the same background color.

#### Scenario: Authenticated customer with a full name

- **WHEN** a customer is signed in with the name "Jane Doe"
- **THEN** the trigger displays a colored circle showing "JD"

#### Scenario: Authenticated user with only a single-word name

- **WHEN** a customer is signed in with the name "Jane"
- **THEN** the trigger displays a colored circle showing "J"

#### Scenario: Authenticated user with only an email

- **WHEN** a customer is signed in with no name but email "jane@example.com"
- **THEN** the trigger displays a colored circle showing "J"

#### Scenario: Color is stable per customer

- **WHEN** the avatar is rendered for the same name on different visits
- **THEN** the background color is identical each time

### Requirement: Profile menu trigger falls back to a generic icon

The trigger SHALL display the generic `User` icon when no customer is
authenticated, while the session is loading, or when an authenticated session
has neither a name nor an email.

#### Scenario: Signed-out visitor

- **WHEN** no customer is authenticated
- **THEN** the trigger displays the generic `User` icon

#### Scenario: Session still loading

- **WHEN** the authentication session has not yet resolved
- **THEN** the trigger displays the generic `User` icon

### Requirement: Signed-in dropdown exposes customer navigation including Wishlist

The profile-menu dropdown for a signed-in customer SHALL link to the customer's
account destinations in this order: My account, My orders, Saved addresses,
Wishlist, then (for ADMIN users only) Admin panel, then Log out. The Wishlist
item SHALL link to `/wishlist`.

#### Scenario: Customer opens the dropdown

- **WHEN** a signed-in customer (role CUSTOMER) opens the profile menu
- **THEN** the menu shows My account, My orders, Saved addresses, Wishlist, and Log out
- **AND** the Wishlist item navigates to `/wishlist`
- **AND** no Admin panel item is shown

#### Scenario: Admin opens the dropdown

- **WHEN** a signed-in user with role ADMIN opens the profile menu
- **THEN** the menu additionally shows an Admin panel item linking to `/admin`

### Requirement: Signed-out dropdown offers authentication entry points

The profile-menu dropdown SHALL, when no customer is authenticated, show only
Log in and Sign up links.

#### Scenario: Signed-out visitor opens the dropdown

- **WHEN** a signed-out visitor opens the profile menu
- **THEN** the menu shows Log in (→ `/login`) and Sign up (→ `/signup`) and no account or Wishlist items
